# Migration System Guide

## 🚀 Overview

We've created a complete migration system to populate your Firestore database with initial tour package data. This system includes:

- **Migration Scripts**: TypeScript files that define data and operations
- **Command Line Runner**: Scripts to execute migrations from terminal
- **Web Interface**: Test page to run migrations from the browser
- **API Endpoints**: REST API for programmatic migration execution

## 📁 File Structure

```
client/migrations/
├── README.md                 # Migration system documentation
├── MIGRATION_GUIDE.md       # This guide
├── 001-initial-tour-packages.ts  # First migration script
├── 002-additional-tour-packages.ts # Additional tour packages
├── 003-final-tour-packages.ts     # Final tour packages
├── 004-payment-plans.ts           # Payment plans
├── 005-currency-usd-to-eur.ts     # Currency conversion
├── 006-conditional-email-templates.ts # Email templates
├── 008-cancellation-email-template.ts # Cancellation emails
├── 009-initial-payment-reminder-template.ts # Payment reminders
├── 010-scheduled-reminder-email-template.ts # Scheduled reminders
├── 011-file-objects-collection.ts # File objects collection setup
├── migrate.ts               # Command line runner
└── src/app/
    ├── test-migration/      # Web test interface
    │   └── page.tsx
    └── api/migrate/         # API endpoint
        └── route.ts
```

## 🎯 What the First Migration Does

**Migration ID**: `001-initial-tour-packages`  
**Purpose**: Populate tours collection with first 4 tour packages

### Tour Packages Created:

1. **Siargao Island Adventure (SIA)**

   - 6 days, £430, Philippines
   - Wakeboarding, surfing, island hopping, yoga

2. **Philippine Sunrise (PHS)**

   - 11 days, £1100, Philippines
   - Sardine run, canyoneering, surfing
   - 4 travel dates (Aug-Sep 2025)

3. **Philippines Sunset (PSS)**

   - 11 days, £1100, Philippines
   - Manila + Port Barton + El Nido
   - 6 travel dates (May-Nov 2025)

4. **Maldives Bucketlist (MLB)**
   - 8 days, £1300, Maldives
   - Male City, Rasdhoo reefs, dolphin cruise
   - 3 travel dates (May-Jul 2025)

## 🗂️ File Objects Collection Migration

**Migration ID**: `011-file-objects-collection`  
**Purpose**: Set up the file_objects collection for Firebase Storage integration

### What This Migration Does:

- Creates the `file_objects` collection structure
- Establishes document schema for file metadata
- Sets up sample document for collection validation
- Prepares for image upload and storage functionality

### Collection Features:

- **File Metadata**: Name, size, type, upload date
- **User Ownership**: Tracks who uploaded each file
- **Storage References**: Links to Firebase Storage files
- **Tagging System**: User-defined tags for organization
- **Metadata Support**: Description, location, category

### Usage:

```bash
npm run migrate:011
```

## 🛠️ How to Use

### Option 1: Command Line (Recommended for Production)

1. **Install dependencies:**

   ```bash
   cd client
   npm install
   ```

2. **Run the migration:**

   ```bash
   npm run migrate:001
   ```

3. **Test without changes (dry run):**

   ```bash
   npm run migrate:dry-run
   ```

4. **Rollback if needed:**

   ```bash
   npm run migrate:rollback
   ```

5. **Get help:**
   ```bash
   npm run migrate:help
   ```

### Option 2: Web Interface (Great for Development)

1. **Navigate to:** `/test-migration`
2. **Click buttons to:**
   - Run Migration (creates tours)
   - Dry Run (test without changes)
   - Rollback (remove created tours)

### Option 3: API Calls (For automation)

```bash
# Run migration
curl -X POST http://localhost:3000/api/migrate \
  -H "Content-Type: application/json" \
  -d '{"action": "run", "dryRun": false}'

# Dry run
curl -X POST http://localhost:3000/api/migrate \
  -H "Content-Type: application/json" \
  -d '{"action": "run", "dryRun": true}'

# Rollback
curl -X POST http://localhost:3000/api/migrate \
  -H "Content-Type: application/json" \
  -d '{"action": "rollback"}'
```

## 🔒 Safety Features

### Dry Run Mode

- Test migrations without making changes
- See exactly what would be created
- Perfect for development and testing

### Conflict Resolution

- Checks for existing tour codes
- Skips duplicates automatically
- Won't overwrite existing data

### Rollback Support

- Remove all tours created by migration
- Clean up if something goes wrong
- Safe undo functionality

### Error Handling

- Detailed error messages
- Continues processing other tours
- Comprehensive logging

## 📊 Migration Results

Each migration returns detailed results:

```typescript
{
  success: boolean,
  message: string,
  details: {
    created: number,    // Tours successfully created
    skipped: number,    // Tours skipped (duplicates)
    errors: string[]    // Any errors encountered
  }
}
```

## 🚨 Important Notes

### Before Running:

1. **Ensure Firebase is configured** with proper credentials
2. **Check your Firestore rules** allow write operations
3. **Backup existing data** if you have any tours already

### After Running:

1. **Verify tours were created** in your Firestore console
2. **Test the tour form** with the new data
3. **Check tour details view** displays correctly

### Rollback Considerations:

- **Rollback is destructive** - removes all created tours
- **Use dry run first** to see what will be affected
- **Cannot undo rollback** - data is permanently deleted

## 🔄 Creating New Migrations

To add more tour packages or other data:

1. **Create new file**: `002-more-tours.ts`
2. **Follow the template** from `001-initial-tour-packages.ts`
3. **Add to migrate.ts** runner
4. **Update package.json** scripts
5. **Test thoroughly** before running

## 🧪 Testing

### Development Testing:

1. Use the web interface at `/test-migration`
2. Start with dry run to verify data
3. Test rollback functionality
4. Check Firestore console for results

### Production Testing:

1. Test on staging environment first
2. Use command line tools
3. Verify data integrity
4. Monitor for any errors

## 📞 Support

If you encounter issues:

1. **Check console logs** for detailed error messages
2. **Verify Firebase configuration** is correct
3. **Ensure Firestore rules** allow the operations
4. **Use dry run mode** to debug issues
5. **Check the migration script** for syntax errors

## 🎉 Success Indicators

Your migration was successful if:

- ✅ Console shows "Migration SUCCESS"
- ✅ All 4 tours appear in Firestore
- ✅ Tour codes are unique (SIA, PHS, PSS, MLB)
- ✅ Pricing and dates are correct
- ✅ Itinerary and highlights are populated
- ✅ No errors in the results

---

**Happy Migrating! 🚀**
