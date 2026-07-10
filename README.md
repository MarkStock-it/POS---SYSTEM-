# POS-System

## Configuring the frontend -> PHP backend base URL

If your app is served from a subdirectory on the server (for example `https://dcism.org/~username/pos/`), the frontend must target the correct PHP backend path.

You can set a global base URL that the frontend will use for API calls by adding this script to your HTML (in the `<head>` before other scripts):

```html
<script>
  // example: for a subdomain-root deployment, use the site root
  window.PHP_API_BASE_URL = '/';
</script>
```

The frontend now maps the auth calls to the actual PHP files in the project (`PHP-TEST/auth/login.php`, `register.php`, and `users.php`) so the register page can reach them on the university server.

If you still get a 404, verify the public folder name on the server and update `window.PHP_API_BASE_URL` accordingly.
