# POS-System

## Configuring the frontend -> PHP backend base URL

If your app is served from a subdirectory on the server (for example `https://dcism.org/~username/pos/`), the frontend must target the correct PHP backend path.

You can set a global base URL that the frontend will use for API calls by adding this script to your HTML (in the `<head>` before other scripts):

```html
<script>
	// example: set to the subdirectory where your PHP scripts live
	window.PHP_API_BASE_URL = '/~username/pos';
</script>
```

With no `window.PHP_API_BASE_URL` provided, the client will now convert absolute-root API paths (those starting with `/`) into relative paths (e.g. `/api/auth/register` -> `./api/auth/register`) so requests target the current app directory instead of the server root.

If you still get a 404, verify the backend script path on the server and update `window.PHP_API_BASE_URL` accordingly.
