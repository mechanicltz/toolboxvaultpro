# Toolbox Tracker — PRD

## Goal
A mobile-first tool inventory tracker for managing tools across a toolbox/garage.

## Users
Single user (no auth). Personal home/workshop use.

## Core Features
- **Tool Inventory**: Add tools with name, description, brand, model, serial number, cost, purchase date, condition, location, tags, photos (base64), documents (base64).
- **Search & Filter**: Full-text search across name/description/brand/model/serial/tags/location. Filter by ALL / AVAILABLE / CHECKED OUT.
- **Locations**: Manage named locations (Garage, Toolbox, Shed, Workbench, etc.).
- **Tags**: Manage colored tags (Power, Hand, Cordless, etc.).
- **People (Borrowers)**: Save people who borrow tools, or use free-text entry.
- **Check-out / Check-in**: Track who has each tool, with notes and complete history.
- **PDF Reports**: Export Full Inventory, Checked-Out only, Available only, and per-tool detail (with photos & history).
- **Photos**: Capture from camera or pick from gallery, stored as base64.
- **Documents**: Attach files (warranty, manual) as base64.

## Design
Modern industrial dark theme — black background, yellow/orange accents (`#FFB300`), sharp edges, condensed/heavy typography, status dots.

## Tech
- Backend: FastAPI + MongoDB (motor), all routes under `/api`.
- Frontend: Expo Router (file-based), React Native, expo-image-picker, expo-document-picker, expo-print, expo-sharing.

## Smart Enhancement
Total inventory **value tracking** with cost rollups on the Reports dashboard — answers "how much is my toolbox worth?" for insurance / tax records.
