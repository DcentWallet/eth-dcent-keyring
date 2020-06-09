try {
  module.exports = window || {
    location: {
      protocol: 'https',
    },
    addEventListener: (_) => false,
    setTimeout: (_) => false,
  }
} catch (e) {
  module.exports = {
    location: {
      protocol: 'https',
    },
    addEventListener: (_) => false,
    setTimeout: (_) => false,
  }
}
