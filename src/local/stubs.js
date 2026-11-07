// Stand-ins for server-only packages in the mobile build.

// cookie-parser: the local adapter already hands the handler parsed cookies.
export default function cookieParser() {
  return (req, _res, next) => {
    req.cookies = req.cookies || {};
    next();
  };
}
