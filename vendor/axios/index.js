const fetchFn = global.fetch || require('node-fetch');

async function request(config = {}) {
  const { method = 'get', url = '', baseURL = '', headers = {}, data } = config;
  const body = data !== undefined ? (typeof data === 'string' ? data : JSON.stringify(data)) : undefined;
  const response = await fetchFn(baseURL + url, {
    method: method.toUpperCase(),
    headers,
    body,
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch (_) {
    parsed = text;
  }

  return {
    data: parsed,
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    config,
  };
}

function axios(config) {
  return request(config);
}

axios.create = function create(defaultConfig = {}) {
  const instance = (cfg) => request({ ...defaultConfig, ...cfg });
  instance.defaults = defaultConfig;
  instance.post = (url, data, cfg) => request({ ...defaultConfig, ...cfg, url, data, method: 'post' });
  instance.get = (url, cfg) => request({ ...defaultConfig, ...cfg, url, method: 'get' });
  return instance;
};

axios.AxiosError = class AxiosError extends Error {
  constructor(message, code, config, response) {
    super(message);
    this.name = 'AxiosError';
    this.code = code;
    this.config = config;
    this.response = response;
  }
};

module.exports = axios;
module.exports.default = axios;
module.exports.AxiosError = axios.AxiosError;
