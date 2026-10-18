// @testing-library/react-native v13 include gia' i matcher: non serve
// alcun extend-expect. Qui restano solo le impostazioni globali dei test
// dei componenti.
jest.useFakeTimers({ doNotFake: ['nextTick'] });
