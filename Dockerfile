FROM caddy:2.11.7-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY index.html 404.html apple-touch-icon.png favicon-64.png icon-512.png /srv/
COPY assets /srv/assets
COPY play /srv/play
ENV PORT=8080 SITE_ROOT=/srv APP_UPSTREAM=neocast.railway.internal:3000
EXPOSE 8080
