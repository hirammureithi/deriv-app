import React, { useEffect } from 'react';
import { useActiveWalletAccount } from '@deriv/api-v2';
import { TSocketError } from '@deriv/api-v2/types';
import { getInitialLanguage, Localize, useTranslations } from '@deriv-com/translations';
import { WalletsErrorScreen } from '../../../../components';
import { CryptoDepositErrorCodes } from '../../../../constants/errorCodes';

type TProps = {
    error: TSocketError<'cashier'>['error'];
};

type TErrorContent = {
    buttonText?: React.ReactNode;
    message: React.ReactNode;
    onClick?: () => void;
    title: React.ReactNode;
};

type TErrorCodeHandlers = Record<string, TErrorContent>;

const DepositErrorScreen: React.FC<TProps> = ({ error }) => {
    const { data } = useActiveWalletAccount();
    const { currentLang, localize } = useTranslations();
    const i18nLanguage = getInitialLanguage();
    const currency = data?.currency;

    useEffect(() => {
        // reload when language is switched to show error message for latest WS connection
        if (currentLang !== i18nLanguage) {
            window.location.reload();
        }
    }, [currentLang, i18nLanguage]);

    const defaultContent: TErrorContent = {
        buttonText: <Localize i18n_default_text='Refresh page' />,
        message: error.message,
        onClick: () => window.location.reload(),
        title: <Localize i18n_default_text='Something went wrong' />,
    };

    const depositErrorCodeHandlers: TErrorCodeHandlers = {
        [CryptoDepositErrorCodes.CryptoConnectionError]: {
            ...defaultContent,
            buttonText: undefined,
            title: <Localize i18n_default_text='Maintenance in progress' />,
        },
        [CryptoDepositErrorCodes.SuspendedCurrency]: {
            ...defaultContent,
            buttonText: undefined,
            message: localize(
                'Due to system maintenance, deposits with your {{currency}} Wallet are unavailable at the moment. Please try again later.',
                { currency }
            ),
            title: (
                <Localize
                    i18n_default_text='{{currency}} Wallet deposits are temporarily unavailable'
                    values={{ currency }}
                />
            ),
        },
        [CryptoDepositErrorCodes.SuspendedDeposit]: {
            ...defaultContent,
            buttonText: undefined,
            message: localize(
                'Due to system maintenance, deposits with your {{currency}} Wallet are unavailable at the moment. Please try again later.',
                { currency }
            ),
            title: (
                <Localize
                    i18n_default_text='{{currency}} Wallet deposits are temporarily unavailable'
                    values={{ currency }}
                />
            ),
        },
    };

    const content = depositErrorCodeHandlers[error.code] || defaultContent;

    return <WalletsErrorScreen {...content} />;
};

export default DepositErrorScreen;
