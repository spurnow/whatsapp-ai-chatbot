import express from 'express';
import { config } from 'dotenv';
import OpenAI from 'openai';

// Load environment variables
config();

// Create a web server
const app = express();
const port = process.env.PORT || 3034;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Add middleware to parse JSON bodies
app.use(express.json());

// Initialize OpenAI API
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get('/webhooks', (req, res) => {
  if (
    req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === '1234'
  ) {
    res.send(req.query['hub.challenge']);
  } else {
    res.sendStatus(400);
  }
});

app.post('/webhooks', async (req, res) => {
  const body = req.body.entry[0].changes[0];
  if (body.field !== 'messages') {
    // not from the messages webhook so dont process
    return res.sendStatus(200);
  }

  if (!body.value.messages) {
    return res.sendStatus(200);
  }

  const text = body.value.messages
    .map((message) => message.text.body)
    .join('\n\n');

  console.log(text);

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: text }],
  });

  // Extract the response from the OpenAI completion
  const aiResponse = completion.choices[0].message.content;

  // Extract the phone number from the incoming message
  const phoneNumber = body.value.messages[0].from;

  // Prepare the message payload
  const messagePayload = {
    messaging_product: 'whatsapp',
    to: phoneNumber,
    type: 'text',
    text: {
      body: aiResponse,
    },
  };

  // Send the response back to WhatsApp
  try {
    const response = await fetch(
      `https://graph.facebook.com/v20.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.SYSTEM_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messagePayload),
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    console.log('Message sent successfully');
  } catch (error) {
    console.error('Failed to send message:', error);
  }

  res.sendStatus(200);
});
