import xss from "xss";

const xssOptions = {
  whiteList: {},
  stripIgnoreTag: true,
  stripIgnoreTagBody: ["script", "style"],
};

const clean = (value) => {
  if (typeof value === "string") return xss(value, xssOptions);
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, clean(v)])
    );
  }
  return value;
};

export const sanitize = (req, res, next) => {
  if (req.body) req.body = clean(req.body);

  // mutate in place — don't reassign read-only getters
  if (req.params) {
    const cleanedParams = clean(req.params);
    Object.assign(req.params, cleanedParams);
  }

  if (req.query) {
    const cleanedQuery = clean(req.query);
    Object.keys(req.query).forEach((key) => delete req.query[key]);
    Object.assign(req.query, cleanedQuery);
  }

  next();
};