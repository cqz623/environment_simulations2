# Times Square Pedestrian Occupancy & Wayfinding Simulation

Create a single-page web application that visualizes the semantic model described below, given its entities, attributes, and associated rules. Render a demonstrative example of this semantic model and give interactive means (a toolbar with buttons) to manipulate it according to the actions and rules given.

## Application requirements

- Make this project a simple single-page web application.
- Use vanilla JavaScript.
- The primary view should be a Three.js rendered view that fills the browser window.
- Show a stylized Times Square pedestrian plaza in New York City in 3D with moving pedestrians, visible destinations, paths, and obstacles. Provide a compact overlay for simulation controls and live occupancy and wayfinding statistics.
- Include a Location panel that expresses positions as coordinates and human-readable spatial descriptions, and supports the four spatial queries below.

## Context

This application simulates how pedestrians occupy and move through an urban public plaza. Each pedestrian starts at a valid position, chooses a destination, follows a walkable route, avoids obstacles, and stops upon arrival. The simulation should make changes in movement and occupancy visible when destinations fill up or obstacles block a path.

Use a bounded, ground-level, stylized Times Square plaza as the demonstrative example. This is a conceptual teaching model rather than a survey-accurate map. Represent horizontal positions as local `(x, z)` coordinates in meters; they are not GPS coordinates. Example destinations include a Broadway gateway, plaza seating, TKTS red steps, and a food kiosk. Paths represent the walkable network between these places; obstacles can be permanent features or temporary barriers.

## Entities

The application should represent the following entities:

1. **Pedestrian** — a person moving through or occupying the plaza.
2. **Destination** — a place a pedestrian may choose to visit.
3. **Path** — a walkable connection used to form routes through the plaza.
4. **Obstacle** — an object or area that pedestrians cannot cross.
5. **Public Space** — the plaza that contains all pedestrians, destinations, paths, and obstacles.

## Entity Attributes

Describe each entity with the following parameters:

- **Pedestrian**
  - `id`: unique identifier.
  - `position`: current `(x, z)` coordinates.
  - `speed`: walking speed in meters per second.
  - `destination`: selected Destination, or none.
  - `state`: `idle`, `walking`, `rerouting`, `waiting`, or `arrived`.
  - `route`: ordered Path segments or waypoints toward the destination.
- **Destination**
  - `id` and `name`: unique identifier and display label.
  - `type`: `pedestrian entrance`, `tables & chairs`, `viewing steps`, or `street kiosk`.
  - `position`: `(x, z)` coordinates of its accessible arrival point.
  - `capacity`: maximum number of pedestrians it can hold at once.
  - `occupancy`: number of pedestrians currently at the destination.
- **Path**
  - `id`: unique identifier.
  - `start` and `end`: connected walkable points or destinations.
  - `width`: usable walking width in meters.
  - `status`: `open` or `blocked`.
- **Obstacle**
  - `id`: unique identifier.
  - `type`: `subway entrance`, `planter`, `public tables`, or `temporary barrier`.
  - `position`: `(x, z)` location.
  - `boundary`: footprint that cannot be entered.
- **Public Space**
  - `id` and `name`: unique identifier and display label.
  - `boundary`: polygon defining the plaza's limits.
  - `width` and `length`: overall dimensions in meters.
  - `occupancy`: number of pedestrians currently within the plaza.

## Relationships

- A **Pedestrian** is **located in** one Public Space.
- A **Destination**, **Path**, and **Obstacle** are each **located in** the Public Space.
- A **Pedestrian** **moves toward** one selected Destination at a time.
- A **Path** **connects** two walkable points or destinations; connected Paths form a route.
- An **Obstacle** **blocks** any Path or portion of the Public Space that intersects its boundary.

## Actions

- **Create pedestrian:** Add a pedestrian at an unoccupied, walkable position within the Public Space; initialize the pedestrian as `idle`.
- **Select destination:** Assign a Destination to a selected pedestrian and calculate a walkable route to it.
- **Start/pause walking:** Start or pause movement for the simulation while preserving each pedestrian's current position and route.
- **Add obstacle:** Place an Obstacle within the Public Space, update affected Paths, and recalculate routes for affected pedestrians.
- **Remove obstacle:** Remove a selected Obstacle, reopen any newly walkable Paths, and recalculate affected routes.
- **Reset simulation:** Restore the initial plaza layout, pedestrian positions, destination occupancies, and simulation state.

## Rules

- A Pedestrian's position must remain inside the Public Space boundary.
- A Pedestrian must not enter or pass through an Obstacle boundary.
- A Pedestrian may walk only along a valid route through open Paths. When an Obstacle blocks the current route, the Pedestrian must find a new route; if no route exists, the Pedestrian enters the `waiting` state.
- A Destination's occupancy must never exceed its capacity. A Pedestrian cannot enter a full Destination and must wait outside it or choose another destination.
- When a Pedestrian reaches the selected Destination, the Pedestrian enters the `arrived` state, stops moving, and counts toward that Destination's occupancy.
- If an arrived Pedestrian selects a new Destination, the previous Destination's occupancy decreases before the Pedestrian leaves.
- Pausing the simulation freezes movement without changing positions, routes, or occupancies; resuming continues from the same state.

## Location System

- **Computational location:** Every ground-level position is an `(x, z)` pair in meters within the plaza boundary. The plaza center is `(0, 0)`; positive `x` points east and negative `z` points north. Project a world position through the active Three.js camera to display its screen-pixel coordinates. Clicking the scene performs the inverse ray-to-ground-plane mapping.
- **Human-readable location:** Describe a position using Times Square landmarks and spatial relations, for example `Near the red steps`, `North of the Broadway gateway`, or `Between the red steps and plaza seating`. The subway entrance and public tables are obstacles and landmarks; the four destinations are also landmarks.
- **Object → Location:** Selecting a pedestrian reveals its current world coordinates, screen coordinates, and semantic location. These values update as the pedestrian moves or the camera changes.
- **Location → Occupant:** Clicking a plaza point or entering `(x, z)` reports the pedestrians, destinations, obstacles, and paths whose footprints contain that point. If nothing is present, report open plaza; distinguish locations outside the boundary.
- **Reference Frame → Occupant:** Choose a landmark as a reference frame and report the selected pedestrian's distance, compass direction, and east/north offsets relative to it.
- **Description → Specific Location:** Parse the defined relations `near`, `beside`, cardinal directions `north/south/east/west of`, and `between` two landmarks. Resolve a recognized description to a specific point on an open, walkable path, show its coordinates, and mark it in the 3D view. Explain the rule used; report when no valid point exists.
- **Interpretation rules:** `near` means within 4 meters of the landmark; `beside` means within 3 meters. Directional queries require a point at least 1.2 meters in the requested direction and within 7 meters of the landmark. `between` chooses the open path point closest to the two landmarks' midpoint, within 4 meters of that midpoint. The result must remain inside the plaza and outside obstacles.
