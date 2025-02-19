@echo off
start cmd /k "cd server && npm start"
timeout /t 2
start cmd /k "cd client && npx react-scripts start" 