
# Requirements
1. [.NET Core 6.0](https://dotnet.microsoft.com/en-us/download)
2. [Node.js LTS](https://nodejs.org/en/)
3. [Postgres](https://www.postgresql.org/download/) 

# Setting up 
## 1. Setup the postgres database:
```SQL
CREATE DATABASE furland;
CREATE USER furland WITH PASSWORD 'abc123';
ALTER DATABASE furland OWNER TO furland;
GRANT ALL PRIVILEGES ON DATABASE furland TO furland;
```

## 2. Setup node.js: 
1. Go inside the `ClientApp` directory
2. Run `npm install` 

## 3. Twitter App 
1. Go to [Twitter Developer site](https://developer.twitter.com/en/apps)
2. Set the Redirect URI as "https://localhost:44417/validate/twitter"
3. Save the "API key" and "API secret key"

# Building Instructions

1. Modify `appsettings.json` with the Twitter configuration and the database connection string.
2. Use Visual Studio, or use `dotnet run`.

Note: Twitter only provides [15 API calls per 15 minutes](https://developer.twitter.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-friends-ids) per user authenticated on the website. If you are by yourself and your account has 500 friends, it would take 500 minutes (8 hours) to gather the follower of all your friends. It may be recommended to have your friends log-in into the website a well.

# Releasing 

```bash
#build 
dotnet publish -c Release
# copy files to server
scp -r * ely:~/furland
# run server
dotnet ./FurlandGraph.dll --urls http://0.0.0.0:80
```

# Architecture
1. User logs in with Twitter account on [TwitterController.cs](Controllers/TwitterController.cs)
2. User requests for status update on [GraphController.cs](Controllers/GraphController.cs), which goes into [StatusService.cs](Services/StatusService.cs)
3. The status update checks what work items need to be created for the graph next 
   1. Stage 1: Download the user's profile + friends
   2. Stage 2: Download the user's friends's profiles
   3. Stage 3: Download the user's friends's friends
   4. Stage 4: Calculate the proximity matrix 
4. The user profiles and user friend data is processed by the [HarvestService.cs](Services/HarvestService.cs)
5. The matrix is calculated on [MatrixService.cs](Services/MatrixService.cs)
6. User downloads the matrix into the browser
