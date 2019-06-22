# lucos time
A clock module for lucos

## Features
* Works offline.
* Displays a CSS-powered analogue clock.
* Newer browsers show videos instead of the clock whilst online (note: videos not included).
* Text based browsers show the time written.
* Other javascript modules can request the time by opening this module in an iframe and communicating using post messages.
* Time is computed using a crude version of NTP over AJAX and stored as an offset against the client's time.

## Dependencies
* docker
* docker-compose

## Running
`MEDIAURL=<url>  nice -19 docker-compose up -d --no-build`

_MEDIAURL_ is the url of a directory where the time videos are kept.  Each video is 10 minutes long and its file name is {MEDIAURL}/big_{hour}-{min}.mp4 (hour and min are two digit numbers and rounded to 10 minute intervals)

## Building
The build is configured to run in Dockerhub when a commit is pushed to the master branch in github.