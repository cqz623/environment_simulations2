# Common Ground

An interactive 3D public plaza occupancy and wayfinding simulation based on [semantic-model.md](./semantic-model.md).

## Explore the simulation

- Click a pedestrian, then click a destination to assign a route.
- Use **Create pedestrian** to add another person.
- Use **Add obstacle**, then click in the plaza to place a temporary barrier. Pedestrians reroute when a path is blocked.
- Use **Remove obstacle** and click an obstacle, or remove one from the obstacle list.
- Pause or resume walking, adjust the speed, and reset the plaza at any time.
- Drag to orbit the 3D view and scroll to zoom.

The destination cards display live occupancy. Pedestrians stay within the plaza, avoid obstacle boundaries, wait when no route or destination capacity is available, and stop when they arrive.

## Run locally

Serve this folder with a static HTTP server, such as \`python3 -m http.server 8000\`, then open \`http://localhost:8000\`. Three.js and the web fonts load from CDNs, so the browser needs an internet connection. There is no build step or package installation.

## Publishing

The root of the \`main\` branch is ready for GitHub Pages using **Deploy from a branch**.
