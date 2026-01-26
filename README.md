# Accounting Control

A robust accounting engine application with user authentication, database management, and REST API endpoints.

## Features

- 🔐 JWT-based authentication
- 🗄️ PostgreSQL database with migrations
- 🚀 Express.js REST API
- 🔄 Automatic migration system
- 🛡️ Secure password hashing with bcrypt
- ⚙️ Environment-based configuration

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd accounting-control
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` and configure your database credentials and other settings.

4. Create the PostgreSQL database:
```bash
createdb accounting_control
```

Or using psql:
```sql
CREATE DATABASE accounting_control;
```

## Running the Application

### Development Mode (with auto-reload)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Run Migrations Only
```bash
npm run migrate
```

## API Endpoints

### Health Check
- **GET** `/api/health` - Check if the server is running

### Authentication

#### Register a new user
- **POST** `/api/auth/register`
- **Body:**
```json
{
  "email": "user@example.com",
  "password": "yourpassword",
  "first_name": "John",
  "last_name": "Doe"
}
```

#### Login
- **POST** `/api/auth/login`
- **Body:**
```json
{
  "email": "user@example.com",
  "password": "yourpassword"
}
```

#### Get User Profile (Protected)
- **GET** `/api/auth/profile`
- **Headers:** `Authorization: Bearer <token>`

## Project Structure

```
accounting-control/
├── src/
│   ├── config/          # Configuration files
│   │   ├── database.js  # Database connection
│   │   └── migrate.js   # Migration runner
│   ├── controllers/     # Request handlers
│   │   └── authController.js
│   ├── middleware/      # Express middleware
│   │   └── auth.js      # JWT authentication
│   ├── migrations/      # Database migrations
│   │   └── 001_create_users_table.js
│   ├── models/          # Data models (future)
│   ├── routes/          # API routes
│   │   ├── index.js
│   │   └── auth.js
│   └── app.js           # Express app configuration
├── index.js             # Server entry point
├── .env                 # Environment variables (not in git)
├── .env.example         # Environment template
└── package.json         # Dependencies and scripts
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment mode | development |
| `DB_HOST` | PostgreSQL host | localhost |
| `DB_PORT` | PostgreSQL port | 5432 |
| `DB_NAME` | Database name | accounting_control |
| `DB_USER` | Database user | postgres |
| `DB_PASSWORD` | Database password | postgres |
| `JWT_SECRET` | JWT signing secret | (required) |
| `JWT_EXPIRES_IN` | Token expiration | 24h |
| `CORS_ORIGIN` | CORS allowed origin | http://localhost:3000 |

## Database Migrations

The application includes an automatic migration system. Migrations are run automatically when the server starts. You can also run them manually:

```bash
npm run migrate
```

Migrations are stored in `src/migrations/` and are executed in alphabetical order.

## Development

### Adding New Migrations

Create a new file in `src/migrations/` following the naming convention:
```
XXX_description.js
```

Where XXX is a sequential number (e.g., 002, 003, etc.).

Each migration file should export `up` and `down` functions:

```javascript
async function up(db) {
  await db.query(`CREATE TABLE ...`);
}

async function down(db) {
  await db.query(`DROP TABLE ...`);
}

module.exports = { up, down };
```

## Security Notes

- Always change the `JWT_SECRET` in production
- Never commit `.env` file to version control
- Use strong passwords for database credentials
- Keep dependencies updated

## License

ISC
