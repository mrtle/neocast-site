# Railway production

The Railway `neocast-site` service deploys this repository's `main` branch using the root Dockerfile. The landing page, assets and life-map game are served directly from this repository. Existing account, API, OAuth, Streaming and setup routes pass through to the existing Neocast application over Railway's private network. Its database, storage and shared Sesh service stay in place.

Use port 8080 and health check `/healthz`. `APP_UPSTREAM` defaults to `neocast.railway.internal:3000`. `SITE_ROOT` defaults to `/srv`. These settings contain no credentials. The container includes only public site files, not source tools or Git metadata. GitHub Pages at neocast.us remains compatible.

For native deployment on pushes by Martin or Vedant to `main`, the Railway GitHub app must have access to this repository and a main deployment trigger must be enabled with Wait for CI off. Connecting a public repository can deploy it once without enabling this trigger. The owner's Codex schedule automatically approves eligible main deployments if Railway asks for external-contributor approval, then checks deployment status and public health. That approval monitor requires the laptop and Codex session to be running.
