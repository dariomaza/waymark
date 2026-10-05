# Waymark

Self-hosted inventory for a home / homelab: register storage units (drawers,
boxes, shelves, crates), record the items inside them, and find anything again
by scanning a QR code or searching by name, unit, or location.

**Find your way back.** A waymark is the marker a walker leaves on a trail so
the route can be retraced. Stick one on a box and the box has an address.

A web app (PWA) and an Android app over one API, served from one container,
plus an MCP server so an assistant can be asked where something is.

## Run it

```sh
git clone https://github.com/dariomaza/waymark.git && cd waymark
export WAYMARK_PUBLIC_BASE_URL=https://waymark.example.com   # what every label encodes
docker compose up -d --build
docker compose exec api node_modules/.bin/tsx src/scripts/create-user.ts --username you
```

Then open that address. Every setting is in `apps/api/.env.example`; the rest
— the tunnel, background removal, deploying, the Android app — is in the
documentation.

## Documentation

**https://dariomaza.github.io/waymark/** — the product tour, self-hosting, the
HTTP API, the MCP server, releasing, and how to work on it. The site is built
from [`docs/`](docs/), so it can also be read right here.

Why it is built the way it is: [the decisions](docs/decisions/README.md).
What is pending: [the roadmap](docs/roadmap.md).

## Licence

[MIT](LICENSE).
