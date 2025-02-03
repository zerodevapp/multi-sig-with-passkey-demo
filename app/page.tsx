"use client";
import { Inter } from "next/font/google";
import { useState, useEffect } from "react";
import {
  PASSKEY_URL,
  createWeightedAccountClient,
  loginAndFetchPassKeyPublicKey,
  publicClient,
  registerAndFetchPassKeyPublicKey,
} from "./utils";
import {
  KernelSmartAccountImplementation,
} from "@zerodev/sdk";
import {
  WeightedKernelAccountClient,
  toECDSASigner,
  toWebAuthnSigner,
} from "@zerodev/weighted-validator";
import { WebAuthnKey, toWebAuthnKey } from "@zerodev/webauthn-key";
import { privateKeyToAccount } from "viem/accounts";
import {
  Hex,
  PrivateKeyAccount,
  Transport,
  Chain,
  zeroAddress,
  Address,
} from "viem";

import { SmartAccount } from "viem/account-abstraction";

const inter = Inter({ subsets: ["latin"] });

export default function Home() {
  const [passKeyName, setPassKeyName] = useState("");
  const [publicKey, setPublicKey] = useState<WebAuthnKey>();
  const [privateKey, setPrivateKey] = useState<Hex>();
  const [scwAddress, setScwAddress] = useState<Address>();
  const [signatures, setSignatures] = useState<Hex[]>([]);
  const [signer, setSigner] = useState<PrivateKeyAccount>();
  const [kernelClient, setKernelClient] =
    useState<
      WeightedKernelAccountClient<
        Transport,
        Chain,
        SmartAccount<KernelSmartAccountImplementation>
      >
    >();
  const [txHash, setTxHash] = useState<Hex>();

  useEffect(() => {
    const pKey =
      "0x2827b876ee775816460ab6eb4481352a752101f950899831702ccead54bde932"; // generatePrivateKey();
    setPrivateKey(pKey);
    setSigner(privateKeyToAccount(pKey));
  }, []);

  useEffect(() => {
    if (!kernelClient || !kernelClient.account) return;
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

  const createPassKeyWeightedAccount = async () => {
    if (!signer || !publicKey) return;
    const webAuthnKey = await toWebAuthnKey({
      passkeyName: passKeyName,
      passkeyServerUrl: PASSKEY_URL,
      webAuthnKey: publicKey,
      rpID: publicKey.rpID,
    });
    const passKeySigner = await toWebAuthnSigner(publicClient, {
      webAuthnKey,
    });
    const client = await createWeightedAccountClient(
      passKeySigner,
      signer?.address,
      publicKey
    );
    console.log({ passKeyClient: client });
    setKernelClient(client);
  };

  const createEcdsaWeightedAccount = async () => {
    if (!signer || !publicKey) return;
    const ecdsaSigner = await toECDSASigner({
      signer,
    });
    const client = await createWeightedAccountClient(
      ecdsaSigner,
      signer?.address,
      publicKey
    );
    console.log({ ecdsaClient: client });
    setKernelClient(client);
  };

  const approveUserOperation = async () => {
    if (!kernelClient || !kernelClient.account) return;
    const signature = await kernelClient.approveUserOperation({
      callData: await kernelClient.account.encodeCalls([
        {
          to: zeroAddress,
          data: "0x",
          value: BigInt(0),
        },
      ]),
    });
    console.log({ signature });
    setSignatures([...signatures, signature]);
  };

  const sendTxWithClient = async () => {
    if (!kernelClient) return;
    const userOpHash = await kernelClient.sendUserOperationWithSignatures({
      callData: await kernelClient.account.encodeCalls([
        {
          to: zeroAddress,
          value: BigInt(0),
          data: "0x",
        },
      ]),
      signatures,
    });
    console.log({ userOpHash });
    const txReceipt = await kernelClient.waitForUserOperationReceipt({
      hash: userOpHash,
    });
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
                onClick={createPassKeyWeightedAccount}
                className="btn bg-green-500 text-white rounded-lg px-4 py-2 w-full"
              >
                Create Passkey Client
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
                Step 3: Create Ecdsa Client and Send Tx
              </div>
              <button
                onClick={createEcdsaWeightedAccount}
                className="btn bg-red-500 text-white rounded-lg px-4 py-2 w-full"
              >
                Create Ecdsa Client
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
