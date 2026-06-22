# API Keys

Keys are read from `x-api-key` or `Authorization: ApiKey <key>` and compared in
constant time. Multiple keys and async resolvers are supported.

## NestJS

```ts
SabrinaShieldModule.forRoot({ apiKeys: { keys: ['key-a', 'key-b'] } });
```

```ts
@Post('internal')
@ApiKey()
internal() {}
```

Missing/invalid keys yield `401`:

```json
{ "success": false, "code": "API_KEY_INVALID", "message": "Invalid or missing API key." }
```

## Dynamic keys

```ts
apiKeys: {
  keys: async () => db.apiKeys.findActive();
}
```

## Options

- `header` — custom header (default `x-api-key`).
- `scheme` — Authorization scheme to accept (default `ApiKey`; `null` disables it).
