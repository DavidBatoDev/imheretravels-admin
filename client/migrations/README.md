# Database Migration System

This folder contains the migration system for populating the Firestore database with tour package data.

## Overview

The migration system consists of three sequential migrations that populate the `tourPackages` collection with 12 complete tour packages:

- **Migration 001**: Initial tour packages (4 tours)
- **Migration 002**: Additional tour packages (4 tours)
- **Migration 003**: Final tour packages (4 tours)

## Migration System Changes

**Previous**: Used npm scripts (e.g., `npm run migrate:001`)
**Current**: Uses `tsx` command directly (e.g., `tsx migrations/migrate.ts 001`)

This approach provides:

- **Direct execution** without package.json dependencies
- **Better portability** across different environments
- **Cleaner project structure** with fewer npm scripts
- **Consistent with modern Node.js practices**

## Prerequisites

1. **Node.js and npm** installed
2. **tsx** package installed globally: `npm install -g tsx`
3. **Firebase project** configured with Firestore
4. **Environment variables** set up in `.env.local`

> **Note**: The npm scripts have been removed from package.json. All migrations now use the `tsx` command directly.

## Quick Start

### 1. Install tsx (if not already installed)

```bash
npm install -g tsx
```

### 2. Run Migrations

#### Run Migration 001 (Initial Tour Packages)

```bash
tsx migrations/migrate.ts 001
```

#### Run Migration 002 (Additional Tour Packages)

```bash
tsx migrations/migrate.ts 002
```

#### Run Migration 003 (Final Tour Packages)

```bash
tsx migrations/migrate.ts 003
```

### 3. Test Migrations (Dry Run)

#### Test Migration 001

```bash
tsx migrations/migrate.ts dry-run
```

#### Test Migration 002

```bash
tsx migrations/migrate.ts dry-run002
```

#### Test Migration 003

```bash
tsx migrations/migrate.ts dry-run003
```

### 4. Rollback Migrations

#### Rollback Migration 001

```bash
tsx migrations/migrate.ts rollback
```

#### Rollback Migration 002

```bash
tsx migrations/migrate.ts rollback002
```

#### Rollback Migration 003

```bash
tsx migrations/migrate.ts rollback003
```

### 5. Get Help

```bash
tsx migrations/migrate.ts help
```

## Migration Details

### Migration 001 - Initial Tour Packages

- **SIA**: Siargao Island Adventure (6 days, £430)
- **PHS**: Philippine Sunrise (11 days, £1100)
- **PSS**: Philippines Sunset (11 days, £1100)
- **MLB**: Maldives Bucketlist (8 days, £1300)

### Migration 002 - Additional Tour Packages

- **SLW**: Sri Lanka Wander Tour (12 days, £1100)
- **ARW**: Argentina's Wonders (11 days, £2399)
- **BZT**: Brazil's Treasures (12 days, £1700)
- **VNE**: Vietnam Expedition (11 days, £1100)

### Migration 003 - Final Tour Packages

- **IDD**: India Discovery Tour (13 days, £999/£899)
- **IHF**: India Holi Festival Tour (13 days, £999)
- **TXP**: Tanzania Exploration (10 days, £1899)
- **NZE**: New Zealand Expedition (15 days, £1799)

## Command Reference

| Command       | Description                          |
| ------------- | ------------------------------------ |
| `001`         | Run migration 001 (initial tours)    |
| `002`         | Run migration 002 (additional tours) |
| `003`         | Run migration 003 (final tours)      |
| `dry-run`     | Test migration 001 without changes   |
| `dry-run002`  | Test migration 002 without changes   |
| `dry-run003`  | Test migration 003 without changes   |
| `rollback`    | Undo migration 001                   |
| `rollback002` | Undo migration 002                   |
| `rollback003` | Undo migration 003                   |
| `help`        | Show help information                |

## Safety Features

- **Dry Run Mode**: Test migrations without making database changes
- **Conflict Detection**: Automatically skips tours that already exist
- **Rollback Support**: Remove tours created by specific migrations
- **Error Handling**: Comprehensive error reporting and logging

## File Structure

```
migrations/
├── README.md                           # This file
├── MIGRATION_GUIDE.md                 # Detailed migration guide
├── migrate.ts                          # Main migration runner
├── firebase-config.ts                  # Firebase configuration
├── 001-initial-tour-packages.ts       # Migration 001
├── 002-additional-tour-packages.ts    # Migration 002
└── 003-final-tour-packages.ts         # Migration 003
```

## Web Interface

You can also run migrations through the web interface at `/test-migration` which provides:

- Buttons for all migration actions
- Real-time status updates
- Detailed results display
- Error reporting

## Environment Variables

Ensure your `.env.local` file contains:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

## Troubleshooting

### Common Issues

1. **"tsx command not found"**

   - Install tsx globally: `npm install -g tsx`

2. **Firebase authentication errors**

   - Check environment variables in `.env.local`
   - Ensure Firebase project is properly configured

3. **Migration already run**
   - Use dry-run mode to check current status
   - Use rollback commands to undo migrations

### Getting Help

- Run `tsx migrations/migrate.ts help` for command reference
- Check the web interface at `/test-migration`
- Review migration logs in the console output

## Best Practices

1. **Always test with dry-run first**
2. **Run migrations in sequence (001 → 002 → 003)**
3. **Keep backups before running migrations**
4. **Use rollback commands if issues arise**
5. **Monitor console output for detailed information**

## Support

For issues or questions:

1. Check the console output for error details
2. Review the migration logs
3. Use the web interface for visual feedback
4. Check Firebase console for database changes
