# PHP-TEST backend scaffold

This folder contains a PHP/MySQL-ready backend scaffold for the POS system.

## Files
- db.php: creates and seeds users, products, transactions, and transaction_items
- auth/login.php: authenticates users and returns role-based session payload
- auth/register.php: creates a new user account
- auth/users.php: returns the list of users
- products.php: returns catalog data for the POS and inventory screens
- checkout.php: saves checkout transactions and reduces stock
- transactions.php: returns transaction history

## Database setup
Create a database named `pos_system` (or set DB_NAME in your environment) and ensure your MySQL user has create/read/write permissions.

## Example connection variables
- DB_HOST=localhost
- DB_USER=root
- DB_PASSWORD=
- DB_NAME=pos_system

## Demo credentials
- cashier / 123123
- manager / 123123
- admin / 123123
- superadmin / 123123
