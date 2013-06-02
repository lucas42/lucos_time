# lucos time
A clock module for lucos

# Features
* Works offline.
* Displays a CSS-powered analogue clock.
* Newer browsers show videos instead of the clock whilst online (note: videos not included).
* Text based browsers show the time written.
* Other javascript modules can request the time by opening this module in an iframe and communicating using post messages.
* Time is computed using a crude version of NTP over AJAX and stored as an offset against the client's time.

## Setup
Create a JSON file called "config" in the root of the project.  This should be an object of key/value pairs:
* **mediaurl** (required) This is the url of a directory where the time videos are kept.  Each video is 10 minutes long and its file name is {mediaurl}/big_{hour}-{min}.mp4 (hour and min are two digit numbers and rounded to 10 minute intervals)

## Running
The web server is designed to be run within lucos_services, but can be run standalone by running server.js with nodejs, passing in the port to run on as the first parameter.
