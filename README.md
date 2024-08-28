<p align="center">

<img src="https://github.com/homebridge/branding/raw/latest/logos/homebridge-wordmark-logo-vertical.png" width="150">
<img src="tovala.svg" width="150">

</p>

<span align="center">

# Homebridge Tovala Smart Oven Plugin

</span>

This Homebridge plugin allows you to control your Tovala Smart Oven through Homebridge, enabling integration with HomeKit for smart home automation. It exposes your custom recipes as switches.

### Features

- **Control Your Oven**: Start various routines (e.g., bacon, chicken, pizza) directly from HomeKit.
- **Custom Recipes**: Expose custom recipes as switches for easy control.
- **Automation**: Integrate your oven into home automation routines with Homebridge.

---

### Installation

1. Ensure you have [Node.js](https://nodejs.org/) 18 or later and [Homebridge](https://github.com/homebridge/homebridge) installed.
2. Install the plugin via npm.

### Configuration

Add the plugin to your Homebridge `config.json` file:
```
{
  "platforms": [
    {
      "platform": "TovalaSmartOven",
      "name": "Tovala Smart Oven",
      "email": "your-email@example.com",
      "password": "your-password",
      "userId": "your-user-id"
    }
  ]
}
```
Replace `your-email@example.com`, `your-password`, and `your-user-id` with your Tovala account details.

### Funding

If you find this plugin useful and want to support its development, consider contributing via:

- [PayPal](https://paypal.me/kylewhirl?locale.x=en_US)
- [Buy Me a Coffee](https://www.buymeacoffee.com/kylewhirl)
- [Venmo](https://venmo.com/code?user_id=2312183555817472452)
- [Cash App](https://cash.app/$kylewhirl)
- [Google Pay](https://gpay.app.goo.gl/pay-kJ7CS28rkxN)

