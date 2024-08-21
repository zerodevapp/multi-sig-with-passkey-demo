import {
  toWebAuthnSigner,
  toECDSASigner,
  createWeightedValidator,
  SIGNER_TYPE,
  createWeightedKernelAccountClient,
} from "@zerodev/weighted-validator";
import {
  WebAuthnKey,
  WebAuthnMode,
  toWebAuthnKey
} from "@zerodev/webauthn-key";
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  createKernelAccountClient,
} from "@zerodev/sdk";
import { Address, PrivateKeyAccount, createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { ENTRYPOINT_ADDRESS_V07 } from "permissionless";
import { WeightedSigner } from "@zerodev/weighted-validator";
import { ParamCondition, toCallPolicy, CallPolicyVersion } from "@zerodev/permissions/policies"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { toPermissionValidator } from "@zerodev/permissions"
import { KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { toECDSASigner as toStandaloneECDSASigner } from "@zerodev/permissions/signers"
 

export const PASSKEY_URL =
  "https://passkeys.zerodev.app/api/v3/ac9d7656-0fb5-4bc4-8b7a-fae661945c76";
export const BUNDLER_URL =
  "https://rpc.zerodev.app/api/v2/bundler/ac9d7656-0fb5-4bc4-8b7a-fae661945c76";
export const PAYMASTER_URL =
  "https://rpc.zerodev.app/api/v2/paymaster/ac9d7656-0fb5-4bc4-8b7a-fae661945c76";
export const entryPoint = ENTRYPOINT_ADDRESS_V07;
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
    passkeyServerHeaders: {}
  });
};

export const loginAndFetchPassKeyPublicKey = async (
  passkeyName: string
): Promise<WebAuthnKey> => {
  return await toWebAuthnKey({
    passkeyName,
    passkeyServerUrl: PASSKEY_URL,
    mode: WebAuthnMode.Login,
    passkeyServerHeaders: {}
  });
};

export const createWeightedAccountClient = async (
  signer: WeightedSigner,
  ecdsaSignerAddress: Address,
  publicKey: WebAuthnKey
) => {
  const callPolicy = toCallPolicy({
    policyVersion: CallPolicyVersion.V0_0_3,
    permissions: [
      {
        // target address
        target: entryPoint,
        // Maximum value that can be transferred.  In this case we
        // set it to zero so that no value transfer is possible.
        valueLimit: BigInt(0),
        // // Contract abi
        // abi: contractABI,
        // // Function name
        // functionName: "renew",
      },
    ],
  })
  const pKey = '0xd565cc0ff5dc317e52fb4e9be3c2d5cfd86734a98ffbb97f103e3bac009b30d9'
  const someSigner = toStandaloneECDSASigner({
    signer: privateKeyToAccount(pKey)
  })
  const kernelVersion = KERNEL_V3_1;
  const validator = await toPermissionValidator(publicClient, {
    entryPoint,
    kernelVersion,
    signer: someSigner,
    policies: [
      callPolicy,
      // ...other policies
    ],
  })
  const multiSigValidator = await createWeightedValidator(publicClient, {
    entryPoint,
    kernelVersion,
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
    entryPoint,
    kernelVersion,
    plugins: {
      sudo: multiSigValidator,
      regular: validator,
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
