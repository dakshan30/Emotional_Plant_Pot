import { createContext, useContext } from "react";
import useDeviceConnection from "../hooks/useDeviceConnection";

const DeviceConnectionContext = createContext(null);

export function DeviceConnectionProvider({ children }) {
  const device = useDeviceConnection({
    deviceId: "emotional-plant-pot-demo"
  });

  return (
    <DeviceConnectionContext.Provider value={device}>
      {children}
    </DeviceConnectionContext.Provider>
  );
}

export function useDevice() {
  const ctx = useContext(DeviceConnectionContext);
  if (!ctx) {
    throw new Error("useDevice must be used inside <DeviceConnectionProvider />");
  }
  return ctx;
}