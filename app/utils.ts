import {
  createWeightedValidator,
  createWeightedKernelAccountClient,
} from "@zerodev/weighted-validator";
import {
  WebAuthnKey,
  toWebAuthnKey,
  WebAuthnMode,
} from "@zerodev/webauthn-key";
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { Address, createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { WeightedSigner } from "@zerodev/weighted-validator";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";

export const PASSKEY_URL =
  "https://passkeys.zerodev.app/api/v3/efbc1add-1c14-476e-b3f1-206db80e673c";
export const BUNDLER_URL =
  "https://rpc.zerodev.app/api/v2/bundler/efbc1add-1c14-476e-b3f1-206db80e673c?provider=PIMLICO";
export const PAYMASTER_URL =
  "https://rpc.zerodev.app/api/v2/paymaster/efbc1add-1c14-476e-b3f1-206db80e673c?provider=PIMLICO";
export const entryPoint = getEntryPoint("0.7");
export const chain = sepolia;
export const publicClient = createPublicClient({
  transport: http(BUNDLER_URL),
  chain,
});

export const registerAndFetchPassKeyPublicKey = async (
  passkeyName: string
): Promise<WebAuthnKey> => {
  return await toWebAuthnKey({
    passkeyName,
    passkeyServerUrl: PASSKEY_URL,
    mode: WebAuthnMode.Register,
  });
};

export const loginAndFetchPassKeyPublicKey = async (
  passkeyName: string
): Promise<WebAuthnKey> => {
  return await toWebAuthnKey({
    passkeyName,
    passkeyServerUrl: PASSKEY_URL,
    mode: WebAuthnMode.Login,
  });
};

export const createWeightedAccountClient = async (
  signer: WeightedSigner,
  ecdsaSignerAddress: Address,
  publicKey: WebAuthnKey
) => {
  const multiSigValidator = await createWeightedValidator(publicClient, {
    entryPoint,
    signer,
    kernelVersion: KERNEL_V3_1,
    config: {
      threshold: 100,
      signers: [
        {
          publicKey: ecdsaSignerAddress,
          weight: 50,
        },
        {
          publicKey,
          weight: 100,
        },
      ],
    },
  });

  const account = await createKernelAccount(publicClient, {
    entryPoint,
    kernelVersion: KERNEL_V3_1,
    plugins: {
      sudo: multiSigValidator,
    },
  });

  const paymasterClient = createZeroDevPaymasterClient({
    chain,
    transport: http(PAYMASTER_URL),
  });

  const client = createWeightedKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(BUNDLER_URL),
    paymaster: {
      getPaymasterData: async (userOperation) => {
        return await paymasterClient.sponsorUserOperation({
          userOperation,
        });
      },
    },
  });
  return client;
};
