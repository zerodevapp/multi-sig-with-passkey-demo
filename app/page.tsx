"use client";
import { Inter } from "next/font/google";
import { useState, useEffect } from "react";
import {
  PASSKEY_URL,
  createWeightedAccountClient,
  entryPoint,
  loginAndFetchPassKeyPublicKey,
  publicClient,
  registerAndFetchPassKeyPublicKey,
} from "./utils";
import { KernelAccountClient, KernelSmartAccount } from "@zerodev/sdk";
import { WebAuthnKey } from "@zerodev/webauthn-key";
import {
  WeightedKernelAccountClient,
  encodeSignatures,
  toECDSASigner,
  toWebAuthnSigner,
  getUpdateConfigCall,
  getCurrentSigners
} from "@zerodev/weighted-validator";
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
import { encodeAbiParameters } from "viem/utils";

const inter = Inter({ subsets: ["latin"] });

type SignerConfig = {
  encodedPublicKey: Hex;
  weight: number;
}

export default function Home() {
  const [passKeyName, setPassKeyName] = useState("");
  const [publicKey, setPublicKey] = useState<WebAuthnKey>();
  const [privateKey, setPrivateKey] = useState<Hex>();
  const [scwAddress, setScwAddress] = useState<Address>();
  const [signatures, setSignatures] = useState<Hex[]>([]);
  const [updateConfigSignatures, setUpdateConfigSignatures] = useState<Hex[]>([]);
  const [signer, setSigner] = useState<PrivateKeyAccount>();
  const [secondSigner, setSecondSigner] = useState<PrivateKeyAccount>();
  const [currentSigners, setCurrentSigners] = useState<SignerConfig[]>([]);
  const [kernelClient, setKernelClient] =
    useState<
      WeightedKernelAccountClient<
        ENTRYPOINT_ADDRESS_V07_TYPE,
        Transport,
        Chain,
        KernelSmartAccount<ENTRYPOINT_ADDRESS_V07_TYPE>
      >
    >();
  const [txHash, setTxHash] = useState<Hex>();

  useEffect(() => {
    const pKey =
      "0x2827b876ee775816460ab6eb4481352a752101f950899831702ccead54bde932"; // generatePrivateKey();
    const pKey2 =
      "0x2827b876ee775816460ab6eb4481352a752101f950899831702ccead54000000"; // generatePrivateKey();
    setPrivateKey(pKey);
    setSigner(privateKeyToAccount(pKey));
    setSecondSigner(privateKeyToAccount(pKey2));
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

  const createPassKeyWeightedAccount = async (ecdsaSigner: PrivateKeyAccount) => {
    if (!signer || !publicKey) return;
    const passKeySigner = await toWebAuthnSigner(publicClient, {
      webAuthnKey: publicKey,
    });
    const client = await createWeightedAccountClient(
      passKeySigner,
      ecdsaSigner.address,
      publicKey
    );
    console.log({ passKeyClient: client });
    setKernelClient(client);
  };

  const createEcdsaWeightedAccount = async (eoaSigner: PrivateKeyAccount) => {
    if (!signer || !publicKey) return;
    const ecdsaSigner = await toECDSASigner({
      signer: eoaSigner,
    });
    const client = await createWeightedAccountClient(
      ecdsaSigner,
      eoaSigner.address,
      publicKey
    );
    console.log({ ecdsaClient: client });
    setKernelClient(client);
  };

  const approveUserOperation = async () => {
    if (!kernelClient) return;
    const signature = await kernelClient.approveUserOperation({
      userOperation: {
        callData: await kernelClient.account.encodeCallData({
          to: zeroAddress,
          data: "0x",
          value: BigInt(0),
        }),
      },
    });
    console.log({ signature });
    setSignatures([...signatures, signature]);
  };

  const approveUpdateConfig = async () => {
    if (!kernelClient) return;
    if (!publicKey) return;

    const updateConfigCall = getUpdateConfigCall(entryPoint, 
      {
        threshold: 100,
        signers: [
          {
            publicKey: secondSigner!.address,
            weight: 50,
          },
          {
            publicKey,
            weight: 100,
          },
        ],
      }
    )

    const updateConfigApproval = await kernelClient.approveUserOperation({
      userOperation: {
        callData: await kernelClient.account.encodeCallData(updateConfigCall),
      },
    });
    console.log({ updateConfigApproval });
    setUpdateConfigSignatures([...updateConfigSignatures, updateConfigApproval]);
  };

  const sendTxWithClient = async () => {
    if (!kernelClient) return;
    const userOpHash = await kernelClient.sendUserOperationWithSignatures({
      userOperation: {
        callData: await kernelClient.account.encodeCallData({
          to: zeroAddress,
          value: BigInt(0),
          data: "0x",
        }),
      },
      signatures,
    });
    console.log({ userOpHash });
    const txReceipt = await kernelClient
      .extend(bundlerActions(entryPoint))
      .waitForUserOperationReceipt({ hash: userOpHash });
    console.log({ txReceipt });

    setTxHash(txReceipt.receipt.transactionHash);
  };

  const sendUpdateConfigTxWithClient = async () => {
    if (!kernelClient) return;
    if (!updateConfigSignatures || updateConfigSignatures.length === 0) {
      console.error("updateConfigSignatures is undefined or empty");
      return;
    }
    const userOpHash = await kernelClient.sendUserOperationWithSignatures({
      userOperation: {
        callData: await kernelClient.account.encodeCallData(
          getUpdateConfigCall(entryPoint, 
          {
            threshold: 100,
            signers: [
              {
                publicKey: secondSigner!.address,
                weight: 50,
              },
              {
                publicKey: publicKey!,
                weight: 100,
              },
            ],
          }
        )),
      },
      signatures: [...updateConfigSignatures],
    });
    console.log({ userOpHash });
    const txReceipt = await kernelClient
      .extend(bundlerActions(entryPoint))
    .waitForUserOperationReceipt({ hash: userOpHash });
    console.log({ txReceipt });

    setTxHash(txReceipt.receipt.transactionHash);
  }

  const getCurrentSignersConfig = async () => {
    const currentSignersConfig = await getCurrentSigners(publicClient, {
      entryPoint,
      weightedAccountAddress: scwAddress,
    })
    console.log({ currentSignersConfig });
    setCurrentSigners(currentSignersConfig);
  }

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
              <strong>Second EOA Address:</strong> {secondSigner?.address}
            </div>
            <div className="break-words">
              <strong>Current Signers:</strong> {currentSigners.map((signer) => signer.encodedPublicKey).join(", ")}
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
                onClick={() => createPassKeyWeightedAccount(signer!)}
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
                onClick={() => createEcdsaWeightedAccount(signer!)}
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
            <div className="space-y-2">
              <div className="text-md font-semibold">
                Step 4: Create Passkey Client and Approve Update Config
              </div>
              <button
                onClick={() => createPassKeyWeightedAccount(secondSigner!)}
                className="btn bg-green-500 text-white rounded-lg px-4 py-2 w-full"
              >
                Create Passkey Client Again
              </button>
              <button
                onClick={approveUpdateConfig}
                className="btn bg-purple-500 text-white rounded-lg px-4 py-2 w-full"
              >
                Approve Update Config with PassKey
              </button>
            </div>
            <div className="space-y-2">
              <div className="text-md font-semibold">
                Step 5: Create Ecdsa Client and Send Update Config Tx
              </div>
              <button
                onClick={() => createEcdsaWeightedAccount(secondSigner!)}
                className="btn bg-red-500 text-white rounded-lg px-4 py-2 w-full"
              >
                Create Ecdsa Client
              </button>
              <button
                onClick={sendUpdateConfigTxWithClient}
                className="btn bg-indigo-500 text-white rounded-lg px-4 py-2 w-full"
              >
                Send Update Config Tx with Client
              </button>
            </div>
            <div className="space-y-2">
              <div className="text-md font-semibold">
                Step 6: Get Current Signers
              </div>
              <button
                onClick={() => getCurrentSignersConfig()}
                className="btn bg-red-500 text-white rounded-lg px-4 py-2 w-full"
              >
                Get Current Signers
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
