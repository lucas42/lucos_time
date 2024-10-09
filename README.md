# lucos time
A clock module for lucos

## Dependencies
* docker
* docker-compose

## Running
`MEDIAURL=<url>  nice -19 docker-compose up -d --no-build`

_MEDIAURL_ is the url of a directory where the time videos are kept.  Each video is 10 minutes long and its file name is {MEDIAURL}/big_{hour}-{min}.mp4 (hour and min are two digit numbers and rounded to 10 minute intervals)

## Building
The build is configured to run in Dockerhub when a commit is pushed to the `main` branch in github.