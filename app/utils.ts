import {
  toWebAuthnPubKey,
  WebAuthnMode,
  WebAuthnKey,
  createWeightedValidator,
  createWeightedKernelAccountClient,
} from "@zerodev/weighted-validator";
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { Address, createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { ENTRYPOINT_ADDRESS_V07 } from "permissionless";
import { WeightedSigner } from "@zerodev/weighted-validator";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"
import { zeroAddress, erc20Abi } from "viem"
import { toCallPolicy, CallPolicyVersion } from "@zerodev/permissions/policies"
import { toPermissionValidator } from "@zerodev/permissions"
import { toECDSASigner } from "@zerodev/permissions/signers"
import { KERNEL_V3_VERSION_TYPE } from "@zerodev/sdk/types";

export const PASSKEY_URL =
  "https://passkeys.zerodev.app/api/v3/efbc1add-1c14-476e-b3f1-206db80e673c";
export const BUNDLER_URL =
  "https://rpc.zerodev.app/api/v2/bundler/efbc1add-1c14-476e-b3f1-206db80e673c";
export const PAYMASTER_URL =
  "https://rpc.zerodev.app/api/v2/paymaster/efbc1add-1c14-476e-b3f1-206db80e673c";
export const entryPoint = ENTRYPOINT_ADDRESS_V07;
export const chain = sepolia;
export const publicClient = createPublicClient({
  transport: http(BUNDLER_URL),
  chain,
});

export const registerAndFetchPassKeyPublicKey = async (
  passkeyName: string
): Promise<WebAuthnKey> => {
  return await toWebAuthnPubKey({
    passkeyName,
    passkeyServerUrl: PASSKEY_URL,
    mode: WebAuthnMode.Register,
    passkeyServerHeaders:{},
  });
};

export const loginAndFetchPassKeyPublicKey = async (
  passkeyName: string
): Promise<WebAuthnKey> => {
  return await toWebAuthnPubKey({
    passkeyName,
    passkeyServerUrl: PASSKEY_URL,
    mode: WebAuthnMode.Login,
    passkeyServerHeaders:{},
  });
};

export const createWeightedAccountClient = async (
  signer: WeightedSigner,
  ecdsaSignerAddress: Address,
  publicKey: WebAuthnKey
) => {
  const rSigner = privateKeyToAccount(generatePrivateKey())
  const ecdsaSigner = toECDSASigner({
    signer:rSigner,
  })
  const callPolicy = toCallPolicy({
    policyVersion: CallPolicyVersion.V0_0_3,
    permissions: [
      {
        target: zeroAddress,
        valueLimit: BigInt(0),
        abi: erc20Abi,
        functionName: "approve",
      },
    ],
  })
  const kernelVersion: KERNEL_V3_VERSION_TYPE = '0.3.1'
  const validator = await toPermissionValidator(publicClient, {
    kernelVersion,
    entryPoint,
    signer: ecdsaSigner,
    policies: [ callPolicy ],
  })
  const multiSigValidator = await createWeightedValidator(publicClient, {
    kernelVersion,
    entryPoint,
    signer,
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
    kernelVersion,
    entryPoint,
    plugins: {
      sudo: multiSigValidator,
      regular: validator
    },
  });

  const paymasterClient = createZeroDevPaymasterClient({
    entryPoint,
    chain,
    transport: http(PAYMASTER_URL),
  });

  const client = createWeightedKernelAccountClient({
    account,
    entryPoint,
    chain,
    bundlerTransport: http(BUNDLER_URL),
    middleware: {
      sponsorUserOperation: paymasterClient.sponsorUserOperation,
    },
  });
  return client;
};
