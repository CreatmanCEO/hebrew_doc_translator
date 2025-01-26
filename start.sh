#!/bin/bash

# Установка зависимостей сервера
echo "Installing server dependencies..."
npm install

# Установка зависимостей клиента
echo "Installing client dependencies..."
cd client
npm install
cd ..

# Запуск приложения в режиме разработки
echo "Starting the application..."
npm run dev:full