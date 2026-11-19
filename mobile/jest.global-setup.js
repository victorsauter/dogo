// Runs once, in the Jest process, before the workers start: they inherit the
// environment. The time zone of the machine (or of the CI) must not decide
// whether a date test passes; the app is used in France (Europe/Paris, with
// the changes of March and October).
module.exports = async () => {
  process.env.TZ = 'Europe/Paris';
};
