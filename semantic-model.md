# Public Plaza Occupancy & Wayfinding Simulation

Create a single-page web application that visualizes the semantic model described below, given its entities, attributes, and associated rules. Render a demonstrative example of this semantic model and give interactive means (a toolbar with buttons) to manipulate it according to the actions and rules given.

## Application requirements

- Make this project a simple single-page web application.
- Use vanilla JavaScript.
- The primary view should be a Three.js rendered view that fills the browser window.
- Show a public plaza in 3D with moving pedestrians, visible destinations, paths, and obstacles. Provide a compact overlay for simulation controls and live occupancy and wayfinding statistics.

## Context

This application simulates how pedestrians occupy and move through an urban public plaza. Each pedestrian starts at a valid position, chooses a destination, follows a walkable route, avoids obstacles, and stops upon arrival. The simulation should make changes in movement and occupancy visible when destinations fill up or obstacles block a path.

Use a bounded, ground-level plaza as the demonstrative example. Represent horizontal positions as `(x, z)` coordinates in the plaza, with dimensions and movement distances measured in meters. Example destinations can include an entrance, a bench area, a café, and a shaded area. Paths represent the walkable network between these places; obstacles can be permanent features or temporary barriers.

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
  - `type`: `entrance`, `bench`, `café`, or `shaded area`.
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
  - `type`: `building`, `planter`, or `temporary barrier`.
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
