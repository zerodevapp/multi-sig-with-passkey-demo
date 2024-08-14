import {
  WebAuthnKey,
} from "@zerodev/multi-chain-weighted-validator";
import {
  WebAuthnMode,
  toWebAuthnKey
} from "@zerodev/webauthn-key";
import {
  createKernelAccount,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { Address, Chain, createPublicClient, erc20Abi, Hex, http, zeroAddress } from "viem";
import { baseSepolia, sepolia } from "viem/chains";
import { ENTRYPOINT_ADDRESS_V07 } from "permissionless";
import { WeightedSigner } from "@zerodev/multi-chain-weighted-validator";
import {
  createMultiChainWeightedValidator,
  createMultiChainWeightedKernelAccountClient,
} from "@zerodev/multi-chain-weighted-validator";
import { KERNEL_V3_1 } from '@zerodev/sdk/constants';
import { privateKeyToAccount } from "viem/accounts";
import { toPermissionValidator } from '@zerodev/permissions';
import {
  ParamCondition,
  toCallPolicy,
  CallPolicyVersion,
} from '@zerodev/permissions/policies';
import { toECDSASigner } from '@zerodev/permissions/signers';

export const PASSKEY_URL =
  "https://passkeys.zerodev.app/api/v3/ac9d7656-0fb5-4bc4-8b7a-fae661945c76";
export const BUNDLER_URL =
  "https://rpc.zerodev.app/api/v2/bundler/ac9d7656-0fb5-4bc4-8b7a-fae661945c76";
export const PAYMASTER_URL =
  "https://rpc.zerodev.app/api/v2/paymaster/ac9d7656-0fb5-4bc4-8b7a-fae661945c76";
export const chainConfig: {
  [key: Chain["id"]]: {
    bundler: string;
    paymaster: string;
  };
} = {
  [sepolia.id]: {
    bundler:
      "https://rpc.zerodev.app/api/v2/bundler/ac9d7656-0fb5-4bc4-8b7a-fae661945c76",
    paymaster:
      "https://rpc.zerodev.app/api/v2/paymaster/ac9d7656-0fb5-4bc4-8b7a-fae661945c76",
  },
  [baseSepolia.id]: {
    bundler:
      "https://rpc.zerodev.app/api/v2/bundler/fe6d8ea6-a27d-4123-9b08-8ae2bf2549fb",
    paymaster:
      "https://rpc.zerodev.app/api/v2/paymaster/fe6d8ea6-a27d-4123-9b08-8ae2bf2549fb",
  },
};
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

export const createMultiChainWeightedAccountAndClient = async (
  signer: WeightedSigner,
  ecdsaSignerAddress: Address,
  publicKey: WebAuthnKey,
  chain: Chain
) => {
  const publicClient = createPublicClient({
    transport: http(chainConfig[chain.id].bundler),
    chain,
  });
  const multiSigValidator = await createMultiChainWeightedValidator(
    publicClient,
    {
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
            weight: 50,
          },
        ],
      },
      kernelVersion: KERNEL_V3_1
    },
  );
  const privKey =
  '0x10254f73f8b6742414072457c979b0bbd8e775d6677dbca2695120ac43a83bff' as Hex;
  const ecdsaSigner = toECDSASigner({
    signer: privateKeyToAccount(privKey),
  });
  const callPolicy = toCallPolicy({
        policyVersion: CallPolicyVersion.V0_0_3, //V0_0_4 doesn't work either
        permissions: [
          {
            target: zeroAddress,
            valueLimit: BigInt(0),
            abi: erc20Abi,
            functionName: 'approve',
          },
        ],
      });

  // Fake session key that can only call the ERC20 "approve" on the zero address
  const validator = await toPermissionValidator(publicClient, {
    entryPoint,
    kernelVersion: KERNEL_V3_1,
    signer: ecdsaSigner,
    policies: [callPolicy],
  });
  const account = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: {
      sudo: multiSigValidator,
      regular: validator,
    },
    kernelVersion: KERNEL_V3_1
  });

  const paymasterClient = createZeroDevPaymasterClient({
    entryPoint,
    chain,
    transport: http(chainConfig[chain.id].paymaster),
  });

  const client = createMultiChainWeightedKernelAccountClient({
    account,
    entryPoint,
    chain,
    bundlerTransport: http(chainConfig[chain.id].bundler),
    middleware: {
      sponsorUserOperation: paymasterClient.sponsorUserOperation,
    },
  });
  return { account, client };
};
