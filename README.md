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

```bash
bun run src/index.ts
```
