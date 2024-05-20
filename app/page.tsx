"use client";
import { Inter } from "next/font/google";
import { useState, useEffect } from "react";
import {
  PASSKEY_URL,
  createWeightedAccountClient,
  entryPoint,
  publicClient,
  registerAndFetchPassKeyPublicKey,
} from "./utils";
import { KernelAccountClient, KernelSmartAccount } from "@zerodev/sdk";
import {
  WebAuthnKey,
  WeightedKernelAccountClient,
  encodeSignatures,
  toECDSASigner,
  toWebAuthnSigner,
} from "@zerodev/weighted-validator";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Hex, PrivateKeyAccount, Transport, Chain, zeroAddress } from "viem";
import { ENTRYPOINT_ADDRESS_V07_TYPE } from "permissionless/types";
import { bundlerActions } from "permissionless";
import { encodeAbiParameters } from "viem/utils";

const inter = Inter({ subsets: ["latin"] });

export default function Home() {
  const [passKeyName, setPassKeyName] = useState("");
  const [publicKey, setPublicKey] = useState<WebAuthnKey>();
  const [privateKey, setPrivateKey] = useState<Hex>();
  const [signatures, setSignatures] = useState<Hex[]>([]);
  const [signer, setSigner] = useState<PrivateKeyAccount>();
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
    const pKey = generatePrivateKey();
    setPrivateKey(pKey);
    setSigner(privateKeyToAccount(pKey));
  }, []);

  const createPassKey = async () => {
    const _publicKey = await registerAndFetchPassKeyPublicKey(passKeyName);
    setPublicKey(_publicKey);
  };

  const createPassKeyWeightedAccount = async () => {
    if (!signer || !publicKey) return;
    const passKeySigner = await toWebAuthnSigner(publicClient, {
      passkeyName: passKeyName,
      passkeyServerUrl: PASSKEY_URL,
      pubKey: publicKey,
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

  const sendTxWithClient = async () => {
    if (!kernelClient) return;
    const userOpHash = await kernelClient.sendUserOperation({
      userOperation: {
        callData: await kernelClient.account.encodeCallData({
          to: zeroAddress,
          value: BigInt(0),
          data: "0x",
        }),
        signature: encodeSignatures(signatures),
      },
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
      className={`flex min-h-screen flex-col items-center justify-between p-24 ${inter.className}`}
    >
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <div className="flex flex-col">
          <div className="flex flex-col">
            <div>{`EOA Address:  ${signer?.address}`}</div>
            <div>{`PrivateKey:  ${privateKey}`}</div>
            <div>{`PassKeyName:  ${passKeyName}`}</div>
            <div> {`PassKeyPublicKey-X:  ${publicKey?.pubX}`}</div>
            <div> {`PassKeyPublicKey-Y:  ${publicKey?.pubY}`}</div>
            <div>{`PassKeyPublicKey-authenticatorIdHash:  ${publicKey?.authenticatorIdHash}`}</div>
            <div className="max-w-5xl">{`signatures:  ${signatures}`}</div>
            <div>{`txHash:  ${txHash}`}</div>
          </div>
          <div className="flex flex-col">
            <div>
              <input
                type="text"
                placeholder="PassKey Name"
                value={passKeyName}
                onChange={(e) => setPassKeyName(e.target.value)}
                className="p-2 border border-gray-300 rounded-lg w-full"
              />
              <button onClick={createPassKey}>Create Passkey</button>
            </div>
            <div>
              <button onClick={createPassKeyWeightedAccount}>
                Create Passkey Client
              </button>
            </div>
            <div>
              <button onClick={approveUserOperation}>
                Approve userOperation with PassKey
              </button>
            </div>
            <div>
              <button onClick={createEcdsaWeightedAccount}>
                Create Ecdsa Client
              </button>
            </div>
            <div>
              <button onClick={approveUserOperation}>
                Approve userOperation with Ecdsa
              </button>
            </div>
            <div>
              <button onClick={sendTxWithClient}>Send Tx with Client</button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
