var net = require('net');
const request = require('request');
var config = require('./config');
var switchState = {
  on: 0,
  off: 1
};

exports.receivedMessage = receivedMessage;
exports.receivedPostback = receivedPostback;
exports.typingSwitch = typingSwitch;

function sendRequestAPIAI(message, messageId, callback) {
  request({
    uri: config.APIAI_URL,
    headers: {
      "Content-Type": "application/json",
      "Authorization": config.APIAI_PAGE_ACCESS_TOKEN
    },
    method: "POST",
    json: {
      "lang": "en",
      "sessionId": messageId,
      "query": [
        message
      ]
    }
  }, function (error, response, body) {
    // console.log(body);
    callback(body);
  });
}

function receivedMessage(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;

  var messageId = message.mid;
  var messageText = message.text;
  var messageAttachments = message.attachments;
  var payload = message.quick_reply ? message.quick_reply.payload : message.text;
  payload = payload.toLowerCase()
  var msgText = "";
  if (payload == config.HELP_REPLY.USERS) {
    msgText = config.HELP_MESSAGES.USERS;
  } else if (payload == config.HELP_REPLY.LEAVE) {
    msgText = config.HELP_MESSAGES.LEAVE;
  } else if (payload == config.HELP_REPLY.EVENTS) {
    msgText = config.HELP_MESSAGES.EVENTS;
  } else if (payload == config.HELP_REPLY.PLAN) {
    msgText = config.HELP_MESSAGES.PLAN;
  }

  if (!msgText) {
    sendRequestAPIAI(messageText, messageId, function (message) {
      if (message.result.fulfillment.speech && ['smalltalk.agent.can_you_help', 'smalltalk.confirmation.no', 'smalltalk.confirmation.yes'].indexOf(message.result.action) < 0) {
        sendTextMessage(senderID, message.result.fulfillment.speech);
      } else if (message.result.action == 'smalltalk.agent.can_you_help') {
        sendChatMessage(senderID, "Hi");
      } else {
        sendChatMessage(senderID, messageText);
      }
    });
  } else if (messageAttachments) {
    sendTextMessage(senderID, "Thanks");
  } else {
    sendTextMessage(senderID, msgText);
  }
}

function receivedPostback(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfPostback = event.timestamp;
  var payload = event.postback.payload;

  sendTextMessage(senderID, payload);
}

function postOnFacebook(messageData) {
  request({
    uri: config.FACEBOOK_URL,
    qs: { access_token: config.PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log("Successfully posted data on facebook chat %s for %s", JSON.stringify(body), JSON.stringify(messageData));
    } else {
      console.error("Unable to post data on facebook chat %s error %s", error, body.error.message);
    }
  });
}

function typingSwitch(state, recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    sender_action: (state === switchState.on) ? config.FACEBOOK_STRINGS.TYPING_ON : config.FACEBOOK_STRINGS.TYPING_OFF
  };
  postOnFacebook(messageData);
}

function sendListTemplate(recipientId, listData) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: listData
  };
  postOnFacebook(messageData);
}

function sendChatMessage(recipientId, messageText) {

  var chatscriptSocket = net.createConnection({
    port: config.CHATSCRIPT_CONFIG.PORT,
    host: config.CHATSCRIPT_CONFIG.HOST,
    allowHalfOpen: config.CHATSCRIPT_CONFIG.HALFOPEN
  }, function () {
    var payload = recipientId + config.CHATSCRIPT_CONFIG.BINARY_SEP;
    payload += config.CHATSCRIPT_CONFIG.BOT_NAME + config.CHATSCRIPT_CONFIG.BINARY_SEP;
    payload += messageText + config.CHATSCRIPT_CONFIG.BINARY_SEP;
    chatscriptSocket.write(payload);
  });

  chatscriptSocket.on('data', function (data) {
    var messageData = {
      recipient: {
        id: recipientId
      },
      message: modifyResponse(data.toString())
    };
    postOnFacebook(messageData);
  })

  chatscriptSocket.on('end', function () {
    typingSwitch(1, recipientId);
    console.log('disconnected from server');
  })

  chatscriptSocket.on('error', function (err) {
    typingSwitch(1, recipientId);
    console.log('error from server ' + err + ' ' + chatscriptSocket.address()[1]);
  })

}

function sendTextMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText
    }
  };
  postOnFacebook(messageData);
}

function modifyResponse(msgData) {
  var message = {};
  msgData = msgData.replace(/"/g, "");
  if (msgData.indexOf(config.QUICK_REPLIES.DELIM) > 0) {
    var tempStr = msgData.split(config.QUICK_REPLIES.DELIM);
    message.text = tempStr[0];
    message.quick_replies = [];
    tempStr[1].split(config.QUICK_REPLIES.SPLIT_DELIM).map(function (x, i) {
      if (i > 10)
        return;
      var option = x.trim();
      if (option) {
        var reply = {};
        reply.content_type = config.QUICK_REPLIES.CONTENT_TYPE;
        reply.title = option;
        reply.payload = option;
        message.quick_replies.push(reply);
      }
    })
  } else {
    message.text = msgData;
  }
  return message;
}


