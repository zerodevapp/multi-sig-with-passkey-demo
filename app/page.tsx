"use client";
import { Inter } from "next/font/google";
import { useState, useEffect } from "react";
import {
  PASSKEY_URL,
  createRecoveryClient,
  createWeightedAccountClient,
  entryPoint,
  kernelVersion,
  loginAndFetchPassKeyPublicKey,
  publicClient,
  recoveryExecutorFunction,
  registerAndFetchPassKeyPublicKey,
} from "./utils";
import { KernelSmartAccountImplementation } from "@zerodev/sdk";
import {
  WeightedKernelAccountClient,
  WeightedSigner,
  createWeightedValidator,
  toECDSASigner,
  toWebAuthnSigner,
} from "@zerodev/weighted-validator";
import { WebAuthnKey, toWebAuthnKey } from "@zerodev/webauthn-key";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import {
  Hex,
  PrivateKeyAccount,
  Transport,
  Chain,
  zeroAddress,
  Address,
  encodeFunctionData,
  parseAbi,
} from "viem";

import { SmartAccount } from "viem/account-abstraction";

const inter = Inter({ subsets: ["latin"] });

export default function Home() {
  const [publicKey1, setPublicKey1] = useState<WebAuthnKey>();
  const [publicKey2, setPublicKey2] = useState<WebAuthnKey>();
  const [publicKey3, setPublicKey3] = useState<WebAuthnKey>();
  const [passkeySigner1, setPasskeySigner1] = useState<WeightedSigner>();
  const [passkeySigner2, setPasskeySigner2] = useState<WeightedSigner>();
  const [passkeySigner3, setPasskeySigner3] = useState<WeightedSigner>();
  const [activeSigner, setActiveSigner] = useState<WeightedSigner>();
  const [activeKernelClient, setActiveKernelClient] = useState<string>();
  const [recoveryPrivateKey, setRecoveryPrivateKey] = useState<Hex>();
  const [scwAddress, setScwAddress] = useState<Address>();
  const [signatures, setSignatures] = useState<Hex[]>([]);
  const [recoverySigner, setRecoverySigner] = useState<PrivateKeyAccount>();
  const [status, setStatus] = useState<string>();
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
    if (!kernelClient || !kernelClient.account) return;
    setScwAddress(kernelClient.account.address);
  }, [kernelClient]);

  const createThreePassKeys = async () => {
    const recoveryPrivateKey = generatePrivateKey();
    setRecoveryPrivateKey(recoveryPrivateKey);
    const recoverySigner = privateKeyToAccount(recoveryPrivateKey);
    setRecoverySigner(recoverySigner);
    setStatus("Creating Passkeys");
    const publicKey1 = await registerAndFetchPassKeyPublicKey("passkey1");
    const publicKey2 = await registerAndFetchPassKeyPublicKey("passkey2");
    const publicKey3 = await registerAndFetchPassKeyPublicKey("passkey3");
    setStatus("Passkeys Created");
    setPublicKey1(publicKey1);
    setPublicKey2(publicKey2);
    setPublicKey3(publicKey3);
    const webAuthnKey1 = await toWebAuthnKey({
      passkeyName: "passkey1",
      passkeyServerUrl: PASSKEY_URL,
      webAuthnKey: publicKey1,
      rpID: publicKey1.rpID,
    });
    const webAuthnKey2 = await toWebAuthnKey({
      passkeyName: "passkey2",
      passkeyServerUrl: PASSKEY_URL,
      webAuthnKey: publicKey2,
      rpID: publicKey2.rpID,
    });
    const webAuthnKey3 = await toWebAuthnKey({
      passkeyName: "passkey3",
      passkeyServerUrl: PASSKEY_URL,
      webAuthnKey: publicKey3,
      rpID: publicKey3.rpID,
    });
    const passKeySigner1 = await toWebAuthnSigner(publicClient, {
      webAuthnKey: webAuthnKey1,
    });
    setPasskeySigner1(passKeySigner1);
    const passKeySigner2 = await toWebAuthnSigner(publicClient, {
      webAuthnKey: webAuthnKey2,
    });
    setPasskeySigner2(passKeySigner2);
    const passKeySigner3 = await toWebAuthnSigner(publicClient, {
      webAuthnKey: webAuthnKey3,
    });
    setPasskeySigner3(passKeySigner3);
    setActiveSigner(passKeySigner1);
  };

  const createPassKeyWeightedClient = async (signer: WeightedSigner) => {
    setStatus("Creating Weighted Client");
    if (
      !passkeySigner1 ||
      !passkeySigner2 ||
      !passkeySigner3 ||
      !activeSigner ||
      !publicKey1 ||
      !publicKey2 ||
      !publicKey3 ||
      !recoverySigner
    )
      return;
    const client = await createWeightedAccountClient(
      signer,
      publicKey1,
      publicKey2,
      publicKey3,
      recoverySigner,
      scwAddress
    );
    setKernelClient(client);
    setActiveSigner(signer);
    setStatus("Weighted Client Created");
    switch (signer) {
      case passkeySigner1:
        setActiveKernelClient("passkey1");
        break;
      case passkeySigner2:
        setActiveKernelClient("passkey2");
        break;
      case passkeySigner3:
        setActiveKernelClient("passkey3");
        break;
    }
  };

  const approveUserOperationWithActiveSigner = async () => {
    if (!kernelClient || !kernelClient.account) return;
    setStatus("Approving Operation");
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
    setStatus("Operation Approved");
  };

  const sendTxWithClient = async () => {
    if (!kernelClient) return;
    setStatus("Sending Transaction");
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
    setStatus("Transaction Sent");
    setStatus("Waiting for Transaction Receipt");
    const txReceipt = await kernelClient.waitForUserOperationReceipt({
      hash: userOpHash,
    });
    console.log({ txReceipt });
    setStatus("Transaction Receipt Received");
    setTxHash(txReceipt.receipt.transactionHash);
    setSignatures([]);
  };

  const doRecovery = async () => {
    if (
      !recoverySigner ||
      !scwAddress ||
      !publicKey1 ||
      !publicKey2 ||
      !passkeySigner1
    )
      return;
    setStatus("Creating Recovery Client");
    const recoveryClient = await createRecoveryClient(
      recoverySigner,
      scwAddress
    );
    setStatus("Recovery Client Created");
    setStatus("Creating New Passkey");
    const publicKey3 = await registerAndFetchPassKeyPublicKey("passkey3");
    setStatus("New Passkey3 Created");
    setPublicKey3(publicKey3);
    const webAuthnKey3 = await toWebAuthnKey({
      passkeyName: "passkey3",
      passkeyServerUrl: PASSKEY_URL,
      webAuthnKey: publicKey3,
      rpID: publicKey3.rpID,
    });
    const passKeySigner3 = await toWebAuthnSigner(publicClient, {
      webAuthnKey: webAuthnKey3,
    });
    setPasskeySigner3(passKeySigner3);

    const newValidator = await createWeightedValidator(publicClient, {
      kernelVersion,
      entryPoint,
      signer: passKeySigner3,
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

    setStatus("Sending Recovery Operation");
    const userOpHash = await recoveryClient.sendUserOperation({
      callData: encodeFunctionData({
        abi: parseAbi([recoveryExecutorFunction]),
        functionName: "doRecovery",
        args: [newValidator.address, await newValidator.getEnableData()],
      }),
    });
    setStatus("Recovery Operation Sent");
    console.log({ userOpHash });
    setStatus("Waiting for Recovery Operation Receipt");
    const txReceipt = await recoveryClient.waitForUserOperationReceipt({
      hash: userOpHash,
    });
    setStatus("Recovery Operation Receipt Received");
    console.log({ txReceipt });
    setTxHash(txReceipt.receipt.transactionHash);
    const client = await createWeightedAccountClient(
      passkeySigner1,
      publicKey1,
      publicKey2,
      publicKey3,
      recoverySigner,
      scwAddress
    );
    setKernelClient(client);
    setActiveSigner(passkeySigner1);
    setActiveKernelClient("passkey1");
  };

  return (
    <main
      className={`flex min-h-screen flex-col items-center justify-center p-6 bg-gray-900 ${inter.className}`}
    >
      <div className="space-y-8 max-w-4xl w-full bg-gray-800 shadow-lg rounded-lg p-6 text-white">
        <div className="text-lg font-semibold mb-4">Wallet Information</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2 p-4 bg-gray-700 rounded-lg">
            <div className="break-words text-lime-600">
              <strong>Status:</strong> {status}
            </div>
            <div className="break-words">
              <strong>Active Kernel Client:</strong> {activeKernelClient}
            </div>
            <div className="break-words">
              <strong>Recovery Signer:</strong> {recoverySigner?.address}
            </div>
            <div className="break-words">
              <strong>Passkey1:</strong> {passkeySigner1?.getPublicKey()}
            </div>
            <div className="break-words">
              <strong>Passkey2:</strong> {passkeySigner2?.getPublicKey()}
            </div>
            <div className="break-words">
              <strong>Passkey3:</strong> {passkeySigner3?.getPublicKey()}
            </div>
            <div className="break-words">
              <strong>Active Signer:</strong> {activeSigner?.getPublicKey()}
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
                Step 1: Create Passkeys
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={createThreePassKeys}
                  className="btn bg-blue-500 text-white rounded-lg px-4 py-2"
                >
                  Create Passkeys
                </button>
              </div>
            </div>
            {passkeySigner1 && passkeySigner2 && passkeySigner3 && (
              <>
                <div className="space-y-2">
                  <div className="text-md font-semibold">
                    Step 2: Create Passkey Client with Passkey1 and Approve
                  </div>
                  <button
                    onClick={() => createPassKeyWeightedClient(passkeySigner1)}
                    className="btn bg-green-500 text-white rounded-lg px-4 py-2 w-full"
                  >
                    Create Passkey Client with Passkey1
                  </button>
                  <button
                    onClick={approveUserOperationWithActiveSigner}
                    className="btn bg-purple-500 text-white rounded-lg px-4 py-2 w-full"
                  >
                    Approve Operation with PassKey1
                  </button>
                </div>
                <div className="space-y-2">
                  <div className="text-md font-semibold">
                    Step 3: Create Passkey Client with Passkey3 and Send Tx
                  </div>
                  <button
                    onClick={() => createPassKeyWeightedClient(passkeySigner3)}
                    className="btn bg-red-500 text-white rounded-lg px-4 py-2 w-full"
                  >
                    Create Passkey Client with Passkey3
                  </button>
                  <button
                    onClick={sendTxWithClient}
                    className="btn bg-indigo-500 text-white rounded-lg px-4 py-2 w-full"
                  >
                    Send Tx with PassKey3
                  </button>
                </div>
                <div className="space-y-2">
                  <div className="text-md font-semibold">
                    Step 4: Do Recovery
                  </div>
                  <button
                    onClick={doRecovery}
                    className="btn bg-yellow-500 text-white rounded-lg px-4 py-2 w-full"
                  >
                    Do Recovery
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
