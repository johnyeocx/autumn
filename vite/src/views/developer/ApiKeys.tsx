import { APIKeyTable } from "./APIKeyTable";
import CreateAPIKey from "./CreateAPIKey";

export const ApiKeysView = ({ apiKeys }: any) => {
  return (
    <div>
      <div className="sticky top-0 z-10 border-y bg-stone-100 pl-10 pr-7 h-10 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h2 className="text-sm text-t2 font-medium">Secret API Keys</h2>
          <span className="text-t2 px-1 rounded-md bg-stone-200">
            {apiKeys.length}
          </span>
        </div>
        <CreateAPIKey />
      </div>

      {apiKeys.length > 0 ? (
        <APIKeyTable apiKeys={apiKeys} />
      ) : (
        <div className="flex flex-col items-center justify-center text-t3 text-sm w-full min-h-[60vh] gap-4">
          <img
            src="./secret.png"
            alt="No API Keys"
            className="w-48 h-48 opacity-60 filter grayscale"
            // className="w-48 h-48 opacity-80 filter brightness-0 invert" // this is for dark mode

          />
          <p className="text-sm text-t3 text-center max-w-2xl px-4">
            API keys are used to securely authenticate your requests from your
            server. Learn more{" "}
            <a
              className="text-primary hover:text-primary/80 cursor-pointer"
              href="https://docs.useautumn.com"
              target="_blank"
            >
              here
            </a>
            .
          </p>
        </div>

      )}
    </div>
  );
};
