# Forza Motorsport (8) Telementry
*Should also work with FM7,FH4,FH5, but has not been tested.*
***

<img width="2940" height="1602" alt="image" src="https://github.com/user-attachments/assets/d029cdeb-7088-4319-a01b-9f461bd0da9b" />

## Quick Start

To start, simply clone the repo and run either `start.bat` or `start.sh` (you may also run npm run start-all after installing packages). Set your in-game telemetry settings to localhost on port 5300.

<sup> The web UI only works with Maple Valley (full circuit) for now, but there are plans to add more tracks and an easy way to map the track yourself in the future. </sup>

## Raw Telementry
The websocket (`telemetry-server.js`) runs on port 5301; this can be changed within the file. It outputs all available telemetry data (If there are any missing, make an issue!), with a quick and easy websocket.

## UI

The UI lets you compare all of your laps. Hovering over the track shows the lap time and speed data per lap. You can also see all of your laps in a session at the bottom left of the UI. You can save laps for later, and group laps by user, for local co-op. You can view laps individually with "mini-sector" times or compare laps to see where you could be gaining and losing time!

***

This project is still a work in progress. Feel free to make issues for any bugs you find, or submit a PR with fixes! (Please test all changes in FM8 before creating!)
