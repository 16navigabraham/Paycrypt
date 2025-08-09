// components/NetworkStatus.tsx
"use client";

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useBaseNetworkEnforcer } from '@/hooks/useBaseNetworkEnforcer';
import { Wifi, WifiOff, Loader2, AlertTriangle } from 'lucide-react';

interface NetworkStatusProps {
  showFullAlert?: boolean;
  inline?: boolean;
}

type NetworkStatusType = 'connected' | 'switching' | 'external-wrong-chain' | 'embedded-wrong-chain' | 'disconnected' | 'unknown';
type StatusColorType = 'green' | 'yellow' | 'orange' | 'red' | 'gray';

export function NetworkStatus({ showFullAlert = false, inline = false }: NetworkStatusProps) {
  const {
    isOnBaseChain,
    isSwitchingChain,
    promptSwitchToBase,
    isEmbeddedWallet,
    isExternalWallet,
    canSwitchChain,
    networkStatus,
    getStatusMessage,
    getStatusColor
  } = useBaseNetworkEnforcer();

  const statusColor: StatusColorType = getStatusColor() as StatusColorType;
  const statusMessage: string = getStatusMessage();
  const currentNetworkStatus: NetworkStatusType = networkStatus as NetworkStatusType;

  // Inline version (for headers, etc.)
  if (inline) {
    return (
      <div className="flex items-center gap-2 text-sm">
        {currentNetworkStatus === 'connected' && (
          <>
            <Wifi className="w-4 h-4 text-green-500" />
            <span className="text-green-600">Base Network</span>
          </>
        )}
        {currentNetworkStatus === 'switching' && (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
            <span className="text-yellow-600">Switching...</span>
          </>
        )}
        {(currentNetworkStatus === 'external-wrong-chain' || currentNetworkStatus === 'embedded-wrong-chain') && (
          <>
            <WifiOff className="w-4 h-4 text-orange-500" />
            <span className="text-orange-600">Wrong Network</span>
          </>
        )}
        {currentNetworkStatus === 'disconnected' && (
          <>
            <WifiOff className="w-4 h-4 text-red-500" />
            <span className="text-red-600">Disconnected</span>
          </>
        )}
      </div>
    );
  }

  // Badge version
  if (!showFullAlert) {
    return (
      <Badge 
        variant="outline" 
        className={`${
          statusColor === 'green' ? 'border-green-200 bg-green-50 text-green-700' :
          statusColor === 'yellow' ? 'border-yellow-200 bg-yellow-50 text-yellow-700' :
          statusColor === 'orange' ? 'border-orange-200 bg-orange-50 text-orange-700' :
          statusColor === 'red' ? 'border-red-200 bg-red-50 text-red-700' :
          'border-gray-200 bg-gray-50 text-gray-700'
        }`}
      >
        <div className={`w-2 h-2 rounded-full mr-2 ${
          statusColor === 'green' ? 'bg-green-500' :
          statusColor === 'yellow' ? 'bg-yellow-500' :
          statusColor === 'orange' ? 'bg-orange-500' :
          statusColor === 'red' ? 'bg-red-500' :
          'bg-gray-500'
        }`} />
        {statusMessage}
      </Badge>
    );
  }

  // Full alert version
  if (currentNetworkStatus === 'connected') {
    return (
      <Alert className="border-green-200 bg-green-50">
        <Wifi className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-800">
          <div className="flex items-center justify-between">
            <span>{statusMessage}</span>
            <Badge variant="secondary" className="bg-green-100 text-green-700">
              {isEmbeddedWallet ? '📱 Built-in' : '🔗 External'}
            </Badge>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  if (currentNetworkStatus === 'switching') {
    return (
      <Alert className="border-yellow-200 bg-yellow-50">
        <Loader2 className="h-4 w-4 animate-spin text-yellow-600" />
        <AlertDescription className="text-yellow-800">
          {statusMessage}
        </AlertDescription>
      </Alert>
    );
  }

  if (currentNetworkStatus === 'external-wrong-chain') {
    return (
      <Alert className="border-orange-200 bg-orange-50">
        <AlertTriangle className="h-4 w-4 text-orange-600" />
        <AlertDescription className="text-orange-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Wrong Network</p>
              <p className="text-sm">Your external wallet needs to be switched to Base network.</p>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={promptSwitchToBase}
              disabled={isSwitchingChain}
              className="border-orange-300 hover:bg-orange-100"
            >
              {isSwitchingChain ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Switching...
                </>
              ) : (
                'Switch Network'
              )}
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  if (currentNetworkStatus === 'embedded-wrong-chain') {
    return (
      <Alert className="border-red-200 bg-red-50">
        <AlertTriangle className="h-4 w-4 text-red-600" />
        <AlertDescription className="text-red-800">
          <div>
            <p className="font-medium">Network Configuration Issue</p>
            <p className="text-sm">
              Your built-in wallet should automatically be on Base network. 
              Please try refreshing the page or contact support if this persists.
            </p>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  if (currentNetworkStatus === 'disconnected') {
    return (
      <Alert className="border-red-200 bg-red-50">
        <WifiOff className="h-4 w-4 text-red-600" />
        <AlertDescription className="text-red-800">
          <div>
            <p className="font-medium">No Wallet Connected</p>
            <p className="text-sm">Please connect a wallet to continue.</p>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}

// Convenience components for common use cases
export function NetworkStatusBadge() {
  return <NetworkStatus showFullAlert={false} inline={false} />;
}

export function NetworkStatusInline() {
  return <NetworkStatus showFullAlert={false} inline={true} />;
}

export function NetworkStatusAlert() {
  return <NetworkStatus showFullAlert={true} inline={false} />;
}