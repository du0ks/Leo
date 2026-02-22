import { useState, useEffect } from 'react';
import { useProfile, useUpdatePin } from '../../hooks/useProfile';
import { useUIStore } from '../../stores/uiStore';
import { X, Lock, Unlock, AlertCircle, Loader2 } from 'lucide-react';
import clsx from 'clsx';

interface PinCodeModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function PinCodeModal({ isOpen, onClose }: PinCodeModalProps) {
    const { data: profile, isLoading } = useProfile();
    const updatePin = useUpdatePin();
    const unlockPrivateSpace = useUIStore((state) => state.unlockPrivateSpace);

    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [step, setStep] = useState<'enter' | 'create' | 'confirm'>('enter');
    const [error, setError] = useState<string | null>(null);

    const isSetup = !profile?.pin_code;

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setPin('');
            setConfirmPin('');
            setError(null);
            setStep(isSetup ? 'create' : 'enter');
        }
    }, [isOpen, isSetup]);

    const handleNumberClick = (num: string) => {
        setError(null);
        if (step === 'enter' && pin.length < 4) {
            const newPin = pin + num;
            setPin(newPin);
            if (newPin.length === 4) verifyPin(newPin);
        } else if (step === 'create' && pin.length < 4) {
            const newPin = pin + num;
            setPin(newPin);
            if (newPin.length === 4) {
                setTimeout(() => setStep('confirm'), 200);
            }
        } else if (step === 'confirm' && confirmPin.length < 4) {
            const newConfirm = confirmPin + num;
            setConfirmPin(newConfirm);
            if (newConfirm.length === 4) {
                setTimeout(() => finalizeSetup(pin, newConfirm), 200);
            }
        }
    };

    const handleDelete = () => {
        setError(null);
        if (step === 'enter' || step === 'create') {
            setPin(pin.slice(0, -1));
        } else if (step === 'confirm') {
            setConfirmPin(confirmPin.slice(0, -1));
        }
    };

    const verifyPin = (enteredPin: string) => {
        if (enteredPin === profile?.pin_code) {
            unlockPrivateSpace();
            onClose();
            setPin('');
        } else {
            setError('Incorrect PIN');
            setPin('');
        }
    };

    const finalizeSetup = async (originalPin: string, confirmationPin: string) => {
        if (originalPin === confirmationPin) {
            try {
                await updatePin.mutateAsync(originalPin);
                unlockPrivateSpace();
                onClose();
            } catch (err: any) {
                setError('Failed to save PIN');
                setStep('create');
                setPin('');
                setConfirmPin('');
            }
        } else {
            setError('PINs do not match');
            setConfirmPin('');
        }
    };

    if (!isOpen) return null;

    if (isLoading) {
        return (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
            </div>
        );
    }

    const currentInput = step === 'confirm' ? confirmPin : pin;

    // Keyboard support
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key >= '0' && e.key <= '9') {
            handleNumberClick(e.key);
        } else if (e.key === 'Backspace') {
            handleDelete();
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onKeyDown={handleKeyDown} tabIndex={0}>
            <div className="bg-app-surface border border-app-border rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl relative outline-none animate-slide-up">
                {/* Header */}
                <div className="p-6 text-center border-b border-app-border relative">
                    <button
                        onClick={onClose}
                        className="absolute right-4 top-4 p-2 text-app-muted hover:text-app-text rounded-lg hover:bg-app-bg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    <div className="w-12 h-12 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-4 text-purple-500">
                        {isSetup ? <Unlock className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
                    </div>

                    <h2 className="text-xl font-bold bg-gradient-to-r from-purple-500 to-indigo-500 bg-clip-text text-transparent">
                        Private Space
                    </h2>
                    <p className="text-sm text-app-muted mt-1">
                        {step === 'create' && 'Create a 4-digit PIN to secure your notes'}
                        {step === 'confirm' && 'Confirm your new PIN'}
                        {step === 'enter' && 'Enter your PIN to unlock'}
                    </p>
                </div>

                {/* Body */}
                <div className="p-8">
                    {/* Dots indicator */}
                    <div className="flex justify-center gap-3 mb-8">
                        {[0, 1, 2, 3].map((i) => (
                            <div
                                key={i}
                                className={clsx(
                                    "w-4 h-4 rounded-full transition-all duration-200",
                                    currentInput.length > i
                                        ? "bg-purple-500 scale-110 shadow-[0_0_10px_rgba(168,85,247,0.5)]"
                                        : "bg-app-border border border-app-muted/30"
                                )}
                            />
                        ))}
                    </div>

                    {error && (
                        <div className="flex items-center justify-center gap-2 text-red-500 text-sm mb-6 animate-fade-in">
                            <AlertCircle className="w-4 h-4" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Keypad */}
                    <div className="grid grid-cols-3 gap-4 max-w-[240px] mx-auto">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                            <button
                                key={num}
                                onClick={() => handleNumberClick(num.toString())}
                                className="h-14 rounded-full bg-app-bg border border-app-border text-app-text text-xl font-medium hover:bg-purple-500/10 hover:border-purple-500/30 hover:text-purple-500 transition-all active:scale-95"
                            >
                                {num}
                            </button>
                        ))}
                        <div /> {/* Spacer */}
                        <button
                            onClick={() => handleNumberClick('0')}
                            className="h-14 rounded-full bg-app-bg border border-app-border text-app-text text-xl font-medium hover:bg-purple-500/10 hover:border-purple-500/30 hover:text-purple-500 transition-all active:scale-95"
                        >
                            0
                        </button>
                        <button
                            onClick={handleDelete}
                            className="h-14 rounded-full bg-app-bg border border-app-border text-app-text text-xl font-medium flex items-center justify-center hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-500 transition-all active:scale-95"
                        >
                            <X className="w-6 h-6 opacity-70" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
