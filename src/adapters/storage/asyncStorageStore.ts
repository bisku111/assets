import AsyncStorage from '@react-native-async-storage/async-storage';
import type { KeyValueStore } from './keyValue';

/** Archivio su disco del dispositivo. Unico file che conosce AsyncStorage. */
export const asyncStorageStore: KeyValueStore = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  remove: (key) => AsyncStorage.removeItem(key),
  keys: async () => [...(await AsyncStorage.getAllKeys())],
};
