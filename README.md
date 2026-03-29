# Homebridge Litter Robot 3

A [Homebridge](https://homebridge.io) plugin for controlling the **Litter-Robot 3** through Apple HomeKit using your Whisker app credentials.

## Features

- **Power Switch** -- Turn the Litter-Robot on/off
- **Night Light Switch** -- Toggle the night light
- **Clean Cycle Switch** -- Trigger a clean cycle (momentary, auto-resets)
- **Cat Sensor (Motion)** -- Detects when a cat is using the litter box (triggers HomeKit automations)
- **Cycle Complete (Contact)** -- Opens briefly when a clean cycle finishes (automation trigger)
- **Drawer Full (Contact)** -- Opens when the waste drawer is full
- **Occupancy Sensor** -- Cat detection as occupancy state
- **Waste Drawer Level (Filter Maintenance)** -- Shows remaining drawer capacity (100% = empty, 0% = full)

Auto-discovers all Litter-Robot 3 units on your Whisker account with configurable polling.

## Installation

### Via Homebridge UI

Search for `homebridge-litter-robot-3` in the Homebridge plugin search.

### Via Command Line (from GitHub)

```bash
sudo hb-shell
cd /tmp
git clone https://github.com/cleihgeber/litter-robot-homebridge.git
cd litter-robot-homebridge
npm install --prefix /var/lib/homebridge .
exit
sudo systemctl restart homebridge
```

> **Note:** Your Homebridge plugin path may differ. Check where your other plugins are installed with `ls /var/lib/homebridge/node_modules/`.

## Configuration

Add the following to the `platforms` array in your Homebridge `config.json`:

```json
{
    "platform": "LitterRobot",
    "email": "your-whisker-email@example.com",
    "password": "your-whisker-password",
    "pollingInterval": 30
}
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `platform` | Yes | -- | Must be `"LitterRobot"` |
| `email` | Yes | -- | Your Whisker app email (also accepts `"username"`) |
| `password` | Yes | -- | Your Whisker app password |
| `pollingInterval` | No | `30` | Status polling interval in seconds (minimum 10) |

The plugin also supports configuration through the Homebridge Config UI X settings page.

## HomeKit Automations

Each Litter-Robot exposes sensors specifically designed for HomeKit automations:

| Sensor | Trigger | Example Use |
|--------|---------|-------------|
| **Cat Sensor** (Motion) | Cat enters the litter box | Turn on a bathroom fan, log cat activity |
| **Cycle Complete** (Contact) | Clean cycle finishes | Send a notification that the box is clean |
| **Drawer Full** (Contact) | Waste drawer is full | Send a reminder to empty the drawer |

To set up an automation in the Home app: **Automation > Add > A Sensor Detects Something** and select the desired sensor.

## Authentication

This plugin authenticates with the Whisker cloud API using AWS Cognito SRP (Secure Remote Password), the same method used by the official Whisker mobile app. Tokens are automatically refreshed before expiry.

## Troubleshooting

**"Incorrect username or password"** -- Verify you are using the same email and password as the Whisker mobile app. If you sign in with Google/Apple on the app, you may need to set a password in the Whisker app first.

**"No plugin found for platform LitterRobot"** -- Make sure the plugin is installed in the same `node_modules` directory as your other Homebridge plugins (check with `ls /var/lib/homebridge/node_modules/`).

**Accessories not updating** -- Lower the `pollingInterval` to `10`-`15` seconds for faster status updates. This increases API calls but improves responsiveness.

## Credits

API reverse-engineering based on [pylitterbot](https://github.com/natekspencer/pylitterbot) by [@natekspencer](https://github.com/natekspencer).

## License

ISC
