"use strict";
/* jshint node:true */

// Add the express web framework
const express = require("express");
const app = express();

// Then we'll pull in the message queue client library
// Rabbitmq uses AMQP as a protocol, so this is a generic library for the protocol
const amqp = require("amqplib");

// Use body-parser to handle the PUT data
const bodyParser = require("body-parser");
app.use(
    bodyParser.urlencoded({
        extended: false
    })
);

const dotenv = require('dotenv').config();

// Util is handy to have around, so thats why that's here.
const util = require('util')

// and so is assert
const assert = require('assert');

// We want to extract the port to publish our app on
let port = process.env.PORT || 8080;

// We now take the first bound RabbitMQ service and extract it's credentials object
// let rabbitConn = rabbit_connection_amqps;
let caCert = Buffer.from(process.env.rabbit_certificate_base64, 'base64');
let connectionString = process.env.rabbit_connection_amqps;

// Create auth credentials
let open = amqp.connect(connectionString, { ca: [caCert] });

let routingKey = "words";
let exchangeName = "ibmclouddb";
let qName = "sample";

open
  .then(conn => {
    return conn.createChannel();
  })
  .then(ch => {
    // Bind a queue to the exchange to listen for messages
    // When we publish a message, it will be sent to this queue, via the exchange
    return ch
      .assertExchange(exchangeName, "direct", { durable: true })
      .then(() => {
        return ch.assertQueue(qName, { exclusive: false });
      })
      .then(q => {
        return ch.bindQueue(q.queue, exchangeName, routingKey);
      });
  })
  .catch(err => {
    console.err(err);
    process.exit(1);
});

// Add a word to the message queue
function addMessage(message) {
    return open
        .then(conn => {
            return conn.createChannel();
        })
        .then(ch => {
            ch.publish(exchangeName, routingKey, Buffer(message));
            let msgTxt = message + " : Message sent at " + new Date();
            console.log(" [+] %s", msgTxt);
            return new Promise(resolve => {
                resolve(message);
            });
        });
}

// Get words from the message queue
function getMessage() {
    return open
        .then(conn => {
            return conn.createChannel();
        })
        .then(ch => {
        return ch.get(qName, {}).then(msgOrFalse => {
            return new Promise(resolve => {
                let result = "No messages in queue";
                if (msgOrFalse !== false) {
                    result = msgOrFalse.content.toString() + " : Message received at " + new Date();
                    ch.ack(msgOrFalse);
                }
                console.log(" [-] %s", result);
                resolve(result);
            });
        });
    });
}


// We can now set up our web server. First up we set it to serve static pages
app.use(express.static(__dirname + "/public"));

// The user has clicked submit to add a word and definition to the message queue
// Send the data to the addWord function and send a response if successful
app.put("/message", function(request, response) {
    addMessage(request.body.message)
        .then(function(resp) {
            response.send(resp);
        })
        .catch(function(err) {
            console.log(err);
            response.status(500).send(err);
        });
});

// Read from the message queue when the page is loaded or after a word is successfully added
// Use the getWords function to get a list of words and definitions from the message queue
app.get("/message", function(request, response) {
    getMessage()
        .then(function(messages) {
            response.send(messages);
        })
        .catch(function(err) {
            console.log(err);
            response.status(500).send(err);
        });
});

// Listen for a connection.
app.listen(port, function() {
    console.log("Server is listening on port " + port);
});
