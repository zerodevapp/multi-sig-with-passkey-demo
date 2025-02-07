import {
  createWeightedValidator,
  createWeightedKernelAccountClient,
  getRecoveryAction,
} from "@zerodev/weighted-validator";
import {
  WebAuthnKey,
  toWebAuthnKey,
  WebAuthnMode,
} from "@zerodev/webauthn-key";
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  getValidatorPluginInstallModuleData,
} from "@zerodev/sdk";
import {
  Address,
  createPublicClient,
  http,
  zeroAddress,
  concatHex,
  encodeAbiParameters,
  parseAbiParameters,
} from "viem";
import { sepolia } from "viem/chains";
import { WeightedSigner } from "@zerodev/weighted-validator";
import {
  CALL_TYPE,
  getEntryPoint,
  KERNEL_V3_1,
  PLUGIN_TYPE,
} from "@zerodev/sdk/constants";
import { PrivateKeyAccount } from "viem/accounts";
import { createWeightedECDSAValidator } from "@zerodev/weighted-ecdsa-validator";

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
export const kernelVersion = KERNEL_V3_1;
export const recoveryExecutorFunction =
  "function doRecovery(address _validator, bytes calldata _data)";

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
  publicKey1: WebAuthnKey,
  publicKey2: WebAuthnKey,
  publicKey3: WebAuthnKey,
  recoverySigner: PrivateKeyAccount,
  accountAddress?: Address
) => {
  const multiSigValidator = await createWeightedValidator(publicClient, {
    entryPoint,
    signer,
    kernelVersion,
    config: {
      threshold: 100,
      signers: [
        {
          publicKey: publicKey1,
          weight: 50,
        },
        {
          publicKey: publicKey2,
          weight: 50,
        },
        {
          publicKey: publicKey3,
          weight: 50,
        },
      ],
    },
  });

  const recoveryValidator = await createWeightedECDSAValidator(publicClient, {
    signers: [recoverySigner],
    kernelVersion,
    entryPoint,
    config: {
      threshold: 100,
      signers: [
        {
          address: recoverySigner.address,
          weight: 100,
        },
      ],
    },
  });

  const recoveryAction = getRecoveryAction(entryPoint.version);

  const recoveryPluginInstallModuleData =
    await getValidatorPluginInstallModuleData({
      entryPoint,
      kernelVersion,
      plugin: recoveryValidator,
      action: recoveryAction,
    });

  const account = await createKernelAccount(publicClient, {
    entryPoint,
    kernelVersion,
    plugins: {
      sudo: multiSigValidator,
    },
    pluginMigrations: [
      recoveryPluginInstallModuleData,
      {
        address: recoveryAction.address,
        type: PLUGIN_TYPE.FALLBACK,
        data: concatHex([
          recoveryAction.selector,
          zeroAddress,
          encodeAbiParameters(
            parseAbiParameters("bytes selectorData, bytes hookData"),
            [CALL_TYPE.DELEGATE_CALL, "0x"]
          ),
        ]),
      },
    ],
    // Only needed to set after changing the sudo validator config i.e.
    // changing the threshold or adding/removing/updating signers
    // After doing recovery
    address: accountAddress,
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

export const createRecoveryClient = async (
  signer: PrivateKeyAccount,
  accountAddress: Address,
) => {
  const recoveryValidator = await createWeightedECDSAValidator(publicClient, {
    signers: [signer],
    kernelVersion,
    entryPoint,
    config: {
      threshold: 100,
      signers: [
        {
          address: signer.address,
          weight: 100,
        },
      ],
    },
  });

  const account = await createKernelAccount(publicClient, {
    entryPoint,
    kernelVersion,
    plugins: {
      regular: recoveryValidator,
    },
    address: accountAddress,
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
