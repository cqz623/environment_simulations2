# Common Ground

An interactive 3D public plaza occupancy and wayfinding simulation based on [semantic-model.md](./semantic-model.md).

## Explore the simulation

- Click a pedestrian, then click a destination to assign a route.
- Use **Create pedestrian** to add another person.
- Use **Add obstacle**, then click in the plaza to place a temporary barrier. Pedestrians reroute when a path is blocked.
- Use **Remove obstacle** and click an obstacle, or remove one from the obstacle list.
- Pause or resume walking, adjust the speed, and reset the plaza at any time.
- Drag to orbit the 3D view and scroll to zoom.

## Explore location

The **Location** tab opens by default in the right panel. The selected pedestrian is shown in two forms: exact `(x, z)` meters and a human-readable place description. The panel also shows where that world point appears on screen in pixels. Use **Simulation** to return to occupancy, destinations, and obstacle details.

- Select a pedestrian to answer **Object → Location**.
- Choose a landmark to read the pedestrian's distance and direction relative to it.
- Click **Inspect a point on the map**, then click the plaza, or enter coordinates to answer **Location → Occupant**.
- Enter `Near the fountain`, `North of the entrance`, `Beside the café`, or `Between the fountain and bench garden` to turn a description into a highlighted walkable point.

The coordinate frame uses meters, with `+x` east and `−z` north. Descriptions use explicit spatial rules; no AI service is required.

The destination cards display live occupancy. Pedestrians stay within the plaza, avoid obstacle boundaries, wait when no route or destination capacity is available, and stop when they arrive.

## Run locally

Serve this folder with a static HTTP server, such as \`python3 -m http.server 8000\`, then open \`http://localhost:8000\`. Three.js and the web fonts load from CDNs, so the browser needs an internet connection. There is no build step or package installation.

## Publishing

The root of the \`main\` branch is ready for GitHub Pages using **Deploy from a branch**.
