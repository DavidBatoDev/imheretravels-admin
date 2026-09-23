# Nunjucks Templating in Email Templates

This system allows you to create dynamic email templates that show different content based on variable values. It's perfect for creating personalized emails that adapt to different booking scenarios, payment terms, and customer types.

## How It Works

The template system uses Nunjucks, a powerful templating engine for JavaScript. Nunjucks provides a clean, readable syntax that's easy to learn and maintain.

## Syntax

### Basic Variable Output

```html
{{ variable }}
```

### Basic Conditional Block

```html
{% if variable === "value" %}
<!-- Content to show when condition is true -->
<p>This will only appear when the condition is met</p>
{% endif %}
```

### Multiple Conditions

```html
{% if bookingType === "Group Booking" or bookingType === "Duo Booking" %}
<!-- Content for group bookings -->
<tr>
  <td><strong>Group ID:</strong></td>
  <td>{{ groupId }}</td>
</tr>
{% endif %}
```

### Complex Conditions

```html
{% if availablePaymentTerms !== "Invalid" and availablePaymentTerms !== "Full
payment required within 48hrs" %}
<!-- Content for valid payment terms -->
<p>Thank you for your booking!</p>
{% endif %}
```

## Variables

Variables are referenced using double curly braces: `{{ variableName }}`

### Common Variables in Your Templates

- `{{ fullName }}` - Customer's full name
- `{{ tourPackage }}` - Name of the tour package
- `{{ reservationFee }}` - Deposit amount
- `{{ availablePaymentTerms }}` - Payment plan type (P1, P2, P3, P4, Invalid, etc.)
- `{{ bookingType }}` - Type of booking (Individual, Duo Booking, Group Booking)
- `{{ tourDate }}` - Start date of the tour
- `{{ returnDate }}` - End date of the tour
- `{{ tourDuration }}` - Length of the tour
- `{{ bookingId }}` - Unique booking identifier
- `{{ groupId }}` - Group identifier (for group bookings)
- `{{ mainBooker }}` - Main booker's name (for group bookings)

## Payment Terms Scenarios

### Invalid Booking

```html
{% if availablePaymentTerms === "Invalid" %}
<!-- Show refund information -->
<h3 style="color: red;">Refund Details for Your Booking</h3>
<p>Unfortunately, we're unable to process your booking...</p>
{% endif %}
```

### P1 Payment Plan

```html
{% if availablePaymentTerms === "P1" %}
<!-- Show P1 payment details -->
<h3>Final Payment Due Soon</h3>
<p>There is only one available payment plan...</p>
{% endif %}
```

### P2 Payment Plan

```html
{% if availablePaymentTerms === "P2" %}
<!-- Show P2 payment options -->
<h3>Choose Your Payment Plan</h3>
<p>You have 2 available payment plans...</p>
{% endif %}
```

### Full Payment Required (48 hours)

```html
{% if availablePaymentTerms === "Full payment required within 48hrs" %}
<!-- Show urgent payment requirement -->
<h3>⚠️ Final Payment Required Within 48 Hours</h3>
<p>Your tour departs on {{ tourDate }}, so there is no longer time for a monthly payment plan...</p>
{% endif %}
```

## Conditional Content Examples

### Show/Hide Based on Booking Type

```html
<!-- Always show basic info -->
<tr>
  <td><strong>Traveler Name:</strong></td>
  <td>{{ fullName }}</td>
</tr>

<!-- Only show for group bookings -->
{% if bookingType === "Group Booking" or bookingType === "Duo Booking" %}
<tr>
  <td><strong>Main Booker:</strong></td>
  <td>{{ mainBooker }}</td>
</tr>
<tr>
  <td><strong>Group ID:</strong></td>
  <td>{{ groupId }}</td>
</tr>
{% endif %}
```

### Conditional Payment Information

```html
{% if availablePaymentTerms !== 'Invalid' %}
<!-- Show payment methods for valid bookings -->
<h3>Choose Your Payment Method</h3>
<div class="payment-methods">
  <!-- Payment method details -->
</div>
{% endif %}
```

## Advanced Features

### Filters

Nunjucks provides built-in filters for data manipulation:

```html
<!-- Currency formatting -->
<p>Amount: {{ reservationFee | currency }}</p>

<!-- Date formatting -->
<p>Date: {{ tourDate | date }}</p>

<!-- String manipulation -->
<p>Name: {{ fullName | upper }}</p>
```

### Loops

```html
{% for item in tourItems %}
<li>{{ item.name }} - {{ item.price }}</li>
{% endfor %}
```

### Else If Statements

```html
{% if availablePaymentTerms === "P1" %}
<p>Payment Plan P1</p>
{% elif availablePaymentTerms === "P2" %}
<p>Payment Plan P2</p>
{% else %}
<p>Other payment terms</p>
{% endif %}
```

## Using the Template Editor

### 1. Insert Variables

1. Click the "Variable" button in the editor toolbar
2. Select from available variables or create custom ones
3. Variables are automatically inserted with proper Nunjucks syntax

### 2. Insert Conditional Blocks

1. Click the "Conditional" button in the editor toolbar
2. Use the helper to insert basic conditional blocks
3. Or click on existing variables to create variable-specific conditionals

### 3. Template Validation

The system automatically validates your template syntax:

- Checks for balanced Nunjucks tags
- Validates variable syntax
- Shows errors and warnings
- Uses Nunjucks compiler for syntax validation

### 4. Live Preview

See how your template looks with different data scenarios:

- Switch between different payment term scenarios
- View how conditional content appears/disappears
- Test with various booking types
- Real-time Nunjucks processing

## Best Practices

### 1. Keep Conditions Simple

```html
<!-- Good -->
{% if availablePaymentTerms === "P1" %}

<!-- Avoid complex nested conditions -->
{% if availablePaymentTerms === "P1" and bookingType !== "Invalid" and
reservationFee > 0 %}
```

### 2. Use Clear Variable Names

```html
<!-- Good -->
{{ fullName }} {{ tourPackage }}

<!-- Avoid -->
{{ n }} {{ tp }}
```

### 3. Test All Scenarios

- Test with each payment term type
- Test with different booking types
- Verify conditional content appears/disappears correctly

### 4. Handle Edge Cases

```html
<!-- Always provide fallback content -->
{% if availablePaymentTerms === "P1" %}
<!-- P1 specific content -->
{% elif availablePaymentTerms === "P2" %}
<!-- P2 specific content -->
{% else %}
<!-- Default content for other cases -->
<p>Thank you for your booking!</p>
{% endif %}
```

## Example Template Structure

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Booking Confirmation</title>
  </head>
  <body>
    <!-- Header (always shown) -->
    <h1>Welcome to ImHereTravels!</h1>

    <!-- Conditional greeting based on payment terms -->
    {% if availablePaymentTerms === "Invalid" %}
    <h2>Refund Information</h2>
    <p>We're sorry, but your booking cannot be processed...</p>
    {% endif %} {% if availablePaymentTerms === "P1" %}
    <h2>Payment Plan P1</h2>
    <p>Your final payment is due on {{ p1DueDate }}</p>
    {% endif %}

    <!-- Common footer (always shown) -->
    <p>Best regards,<br />The ImHereTravels Team</p>
  </body>
</html>
```

## Troubleshooting

### Common Issues

1. **Conditional tags not working**

   - Check syntax: `{% if condition %}` and `{% endif %}`
   - Ensure tags are properly closed
   - Verify variable names match exactly

2. **Content not showing**

   - Check your condition logic
   - Verify variable values in your data
   - Use the template validation to check for errors

3. **Template validation errors**
   - Fix mismatched Nunjucks tags
   - Check for empty conditional expressions
   - Ensure proper HTML structure

### Debug Tips

1. Use the template validation feature
2. Test with different data scenarios
3. Check the browser console for errors
4. Use the live preview to see real-time changes

## Security Notes

- Nunjucks provides safe template processing
- No external code execution
- Variables are safely escaped
- Template validation prevents syntax errors

## Next Steps

1. Start with simple conditional blocks
2. Test with your existing email templates
3. Gradually add more complex logic
4. Use the demo component to experiment
5. Integrate with your email sending system

For more help, refer to the demo component or contact the development team.
