# Phone Server

This Express server powers the backend for the PhoneMessenger application.

## Environment Variables

Create a `.env` file in this directory with the following values:

```
MONGO_URI=your-mongodb-connection-string
JWT_SECRET=your-jwt-secret
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_NUMBER=+1xxxxxxxxxx
FRONTEND_URL=http://localhost:5173

# Optional for MMS attachments
SERVER_URL=http://localhost:3000      # base URL used when constructing media URL
IMAGE_NAME=Nelson.jpg               # file in the `Image` folder to attach
MEDIA_URL=https://example.com/path.jpg # if set this will override SERVER_URL/IMAGE_NAME
```

Place any image you want to send in the `Image` directory (e.g. `Image/Nelson.jpg`).

## Static Files

The server exposes the `/images` route to serve files from the local `Image` folder. Twilio
will fetch the image from this route when sending MMS messages.

## Running

```bash
npm install
node server.js
```
