# Picolo Bot
![Tests](https://github.com/PssbleTrngle/PicoloBot/workflows/Tests/badge.svg)

This is a discord bot to play the drinking game picolo with your friends

# Host yourself

You can run the bot yourself using the docker container found at [Dockerhub](https://hub.docker.com/repository/docker/dockergelb/picolo-bot)

```bash
sudo docker run --name picolo -d --env-file ./.env -v db:/var/www/db dockergelb/picolo-bot:latest
```

You need to put some configurations into an `.env` file in the same directory, or in the `docker run` command itself as enviromental variables. 

You can look at the [example file](https://github.com/PssbleTrngle/PicoloBot/blob/master/.env.example) for reference