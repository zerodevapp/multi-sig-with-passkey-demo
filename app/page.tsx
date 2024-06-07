"use client";
import { Inter } from "next/font/google";
import { useState, useEffect } from "react";
import {
  PASSKEY_URL,
  createMultiChainWeightedAccountAndClient,
  entryPoint,
  loginAndFetchPassKeyPublicKey,
  publicClient,
  registerAndFetchPassKeyPublicKey,
} from "./utils";
import { KernelSmartAccount } from "@zerodev/sdk";
import {
  WebAuthnKey,
  toECDSASigner,
  toWebAuthnSigner,
} from "@zerodev/multi-chain-weighted-validator";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  Hex,
  PrivateKeyAccount,
  Transport,
  Chain,
  zeroAddress,
  Address,
} from "viem";
import { ENTRYPOINT_ADDRESS_V07_TYPE } from "permissionless/types";
import { bundlerActions } from "permissionless";
import { MultiChainWeightedKernelAccountClient } from "@zerodev/multi-chain-weighted-validator";
import { baseSepolia, sepolia } from "viem/chains";
import { ApproveUserOperationReturnType } from "@zerodev/multi-chain-weighted-validator";

const inter = Inter({ subsets: ["latin"] });

export default function Home() {
  const [passKeyName, setPassKeyName] = useState("");
  const [publicKey, setPublicKey] = useState<WebAuthnKey>();
  const [privateKey, setPrivateKey] = useState<Hex>();
  const [scwAddress, setScwAddress] = useState<Address>();
  const [signatures, setSignatures] = useState<Hex[]>([]);
  const [approvals, setApprovals] = useState<ApproveUserOperationReturnType[]>(
    []
  );
  const [signer, setSigner] = useState<PrivateKeyAccount>();
  const [kernelClient, setKernelClient] =
    useState<
      MultiChainWeightedKernelAccountClient<
        ENTRYPOINT_ADDRESS_V07_TYPE,
        Transport,
        Chain,
        KernelSmartAccount<ENTRYPOINT_ADDRESS_V07_TYPE>
      >
    >();
  const [txHash, setTxHash] = useState<Hex>();

  useEffect(() => {
    const pKey = generatePrivateKey();
    setPrivateKey(pKey);
    setSigner(privateKeyToAccount(pKey));
  }, []);

  useEffect(() => {
    if (!kernelClient) return;
    setScwAddress(kernelClient.account.address);
  }, [kernelClient]);

  const createPassKey = async () => {
    const _publicKey = await registerAndFetchPassKeyPublicKey(passKeyName);
    setPublicKey(_publicKey);
  };

  const loginPassKey = async () => {
    const _publicKey = await loginAndFetchPassKeyPublicKey(passKeyName);
    setPublicKey(_publicKey);
  };

  const createPassKeyWeightedAccount = async (chain: Chain) => {
    if (!signer || !publicKey) return;
    const passKeySigner = await toWebAuthnSigner(publicClient, {
      passkeyName: passKeyName,
      passkeyServerUrl: PASSKEY_URL,
      pubKey: publicKey,
    });
    const { client } = await createMultiChainWeightedAccountAndClient(
      passKeySigner,
      signer?.address,
      publicKey,
      chain
    );
    console.log({ passKeyClient: client });
    setKernelClient(client);
  };

  const createEcdsaWeightedAccount = async (chain: Chain) => {
    if (!signer || !publicKey) return;
    const ecdsaSigner = await toECDSASigner({
      signer,
    });
    const { client } = await createMultiChainWeightedAccountAndClient(
      ecdsaSigner,
      signer?.address,
      publicKey,
      chain
    );
    console.log({ ecdsaClient: client });
    setKernelClient(client);
  };

  const approveUserOperation = async () => {
    if (!kernelClient) return;
    if (!signer || !publicKey) return;
    const ecdsaSigner = await toECDSASigner({
      signer,
    });
    const multiChainAccounts = (
      await Promise.all(
        [sepolia, baseSepolia].map((chain) =>
          createMultiChainWeightedAccountAndClient(
            ecdsaSigner,
            signer?.address,
            publicKey,
            chain
          )
        )
      )
    ).map((value) => value.account);

    const approval = await kernelClient.approveUserOperation({
      userOperation: {
        callData: await kernelClient.account.encodeCallData({
          to: zeroAddress,
          data: "0x",
          value: BigInt(0),
        }),
      },
      multiChainAccounts,
    });
    console.log({ approval });
    setApprovals([...approvals, approval]);
  };

  const sendTxWithClient = async () => {
    if (!kernelClient) return;
    const userOpHash = await kernelClient.sendUserOperationWithApprovals({
      userOperation: {
        callData: await kernelClient.account.encodeCallData({
          to: zeroAddress,
          value: BigInt(0),
          data: "0x",
        }),
      },
      approvals,
    });
    console.log({ userOpHash });
    const txReceipt = await kernelClient
      .extend(bundlerActions(entryPoint))
      .waitForUserOperationReceipt({ hash: userOpHash });
    console.log({ txReceipt });

    setTxHash(txReceipt.receipt.transactionHash);
  };

  return (
    <main
      className={`flex min-h-screen flex-col items-center justify-center p-6 bg-gray-900 ${inter.className}`}
    >
      <div className="space-y-8 max-w-4xl w-full bg-gray-800 shadow-lg rounded-lg p-6 text-white">
        <div className="text-lg font-semibold mb-4">Wallet Information</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2 p-4 bg-gray-700 rounded-lg">
            <div className="break-words">
              <strong>EOA Address:</strong> {signer?.address}
            </div>
            <div className="break-words">
              <strong>PrivateKey:</strong> {privateKey}
            </div>
            <div className="break-words">
              <strong>PassKeyName:</strong> {passKeyName}
            </div>
            <div className="break-words">
              <strong>PassKeyPublicKey-X:</strong> {publicKey?.pubX.toString()}
            </div>
            <div className="break-words">
              <strong>PassKeyPublicKey-Y:</strong> {publicKey?.pubY.toString()}
            </div>
            <div className="break-words">
              <strong>PassKeyPublicKey-authenticatorIdHash:</strong>{" "}
              {publicKey?.authenticatorIdHash}
            </div>
            <div className="break-words">
              <strong>Smart Wallet Address:</strong> {scwAddress}
            </div>
            <div className="break-words max-h-24 overflow-auto">
              <strong>Signatures:</strong> {signatures.join(", ")}
            </div>
            <div className="break-words max-h-24 overflow-auto">
              <strong>Transaction Hash:</strong> {txHash}
            </div>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-md font-semibold">
                Step 1: Create or Login Passkey
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="PassKey Name"
                  value={passKeyName}
                  onChange={(e) => setPassKeyName(e.target.value)}
                  className="input p-2 border border-gray-300 rounded-lg w-full text-black"
                />
                <button
                  onClick={createPassKey}
                  className="btn bg-blue-500 text-white rounded-lg px-4 py-2"
                >
                  Create Passkey
                </button>
              </div>
              <button
                onClick={loginPassKey}
                className="btn bg-blue-500 text-white rounded-lg px-4 py-2 w-full"
              >
                Login Passkey
              </button>
            </div>
            <div className="space-y-2">
              <div className="text-md font-semibold">
                Step 2: Create Passkey Client and Approve
              </div>
              <button
                onClick={() => createPassKeyWeightedAccount(sepolia)}
                className="btn bg-green-500 text-white rounded-lg px-4 py-2 w-full"
              >
                Create Passkey Client (Sepolia)
              </button>
              <button
                onClick={approveUserOperation}
                className="btn bg-purple-500 text-white rounded-lg px-4 py-2 w-full"
              >
                Approve Operation with PassKey
              </button>
            </div>
            <div className="space-y-2">
              <div className="text-md font-semibold">
                Step 3: Create Ecdsa Client and Send Tx on Sepolia
              </div>
              <button
                onClick={() => createEcdsaWeightedAccount(sepolia)}
                className="btn bg-red-500 text-white rounded-lg px-4 py-2 w-full"
              >
                Create Ecdsa Client (Sepolia)
              </button>
              <button
                onClick={sendTxWithClient}
                className="btn bg-indigo-500 text-white rounded-lg px-4 py-2 w-full"
              >
                Send Tx with Client
              </button>
            </div>
            <div className="space-y-2">
              <div className="text-md font-semibold">
                Step 4: Create Ecdsa Client and Send Tx on Base Sepolia
              </div>
              <button
                onClick={() => createEcdsaWeightedAccount(baseSepolia)}
                className="btn bg-red-500 text-white rounded-lg px-4 py-2 w-full"
              >
                Create Ecdsa Client (Base Sepolia)
              </button>
              <button
                onClick={sendTxWithClient}
                className="btn bg-indigo-500 text-white rounded-lg px-4 py-2 w-full"
              >
                Send Tx with Client
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
