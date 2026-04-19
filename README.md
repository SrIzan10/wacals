# wacals

simple whatsapp calendar notifier. it uses a rest api where you can feed it data through a post request, in case your organization blocks oauth but allows google script.

## install

```bash
bun install
```

## run

populate env:  
```
REDIS_URL=""
# you are better off generating this with "openssl rand -base64 32"
AUTH_KEY="asdfasdasddfasdfasddf"
CHAT_ID=""
```

to get the chat id, add the following code to `src/index.ts` (under the qr code listener) and run it locally. then send a message to the chat you want to send notifs to:  
```ts
wa.on("message_create", (message) => {
  console.log(`[WA] the chat id for the message you sent is: ${message.to}`);
})
```

```bash
bun run src/index.ts
```
